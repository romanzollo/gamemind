/**
 * План синхронизации таксономии: что записать в БД, чтобы она совпала с
 * каталогом. Чистая функция — sync-скрипт читает БД, зовёт план и применяет
 * его; тесты проверяют план без Neon.
 *
 * Инварианты:
 * - contentKey ставится только там, где он NULL, и только уникальный —
 *   ключ, который достался бы двум вопросам, не пишется никому;
 * - связи по умолчанию только добавляются: метки из админки не теряются;
 *   `prune` снимает связи, которых каталог больше не даёт (только метки
 *   домена каталога).
 *
 * Canon: docs/DECISIONS.md → Content taxonomy.
 */

import type { ContentKeySource, DraftTextIndex } from './content-key';
import { resolveContentKey } from './content-key';
import type { QuestionOverrides } from './taxonomy-catalog.schema';
import {
    deriveQuestionTags,
    expandTagRefs,
    type QuestionTagSource,
    type TagRow,
    type TaxonomyIndex,
} from './taxonomy-index';

export type SyncQuestionRow = {
    id: string;
    type: 'TEXT' | 'IMAGE_GUESS';
    publicationStatus: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED';
    isActive: boolean;
    contentKey: string | null;
    metadata: unknown;
    ruText: string | null;
};

export type SyncDraftQuestion = {
    tags?: readonly string[];
    metadata?: Record<string, unknown>;
};

export type ExistingTagRow = Pick<
    TagRow,
    'id' | 'nameRu' | 'nameEn' | 'parentId' | 'sortOrder' | 'playOrder'
>;

export type TaxonomySyncInput = {
    index: TaxonomyIndex;
    overrides: QuestionOverrides;
    draftsByKey: ReadonlyMap<string, SyncDraftQuestion>;
    draftText: DraftTextIndex;
    questions: readonly SyncQuestionRow[];
    existingTags: readonly ExistingTagRow[];
    existingLinks: ReadonlyArray<{ questionId: string; tagId: string }>;
    prune: boolean;
};

export type TaxonomySyncPlan = {
    /** Новые и изменившиеся метки (по названию, семейству, порядку, теме). */
    tagUpserts: TagRow[];
    contentKeys: Array<{
        questionId: string;
        contentKey: string;
        source: ContentKeySource;
    }>;
    linksToAdd: Array<{ questionId: string; tagId: string }>;
    linksToRemove: Array<{ questionId: string; tagId: string }>;
    report: {
        tagSources: Record<QuestionTagSource, number>;
        /** Ключ, который выпал бы нескольким вопросам — не пишется. */
        duplicateKeys: string[];
        unresolvedKeyIds: string[];
        unknownGameNames: Array<{ name: string; count: number }>;
        unknownRefs: string[];
        /** Опубликованные активные вопросы, которым каталог не дал меток. */
        untaggedPublished: Array<{ id: string; contentKey: string | null }>;
    };
};

function readDraftKey(metadata: unknown): string | null {
    if (metadata && typeof metadata === 'object' && 'draftKey' in metadata) {
        const value = (metadata as { draftKey: unknown }).draftKey;
        return typeof value === 'string' && value !== '' ? value : null;
    }
    return null;
}

function readGameName(metadata: unknown): string | null {
    if (metadata && typeof metadata === 'object' && 'game' in metadata) {
        const value = (metadata as { game: unknown }).game;
        return typeof value === 'string' ? value : null;
    }
    return null;
}

function tagChanged(
    next: TagRow,
    current: ExistingTagRow | undefined,
): boolean {
    return (
        !current ||
        current.nameRu !== next.nameRu ||
        current.nameEn !== next.nameEn ||
        current.parentId !== next.parentId ||
        current.sortOrder !== next.sortOrder ||
        current.playOrder !== next.playOrder
    );
}

export function planTaxonomySync(input: TaxonomySyncInput): TaxonomySyncPlan {
    const { index } = input;

    const existingTagsById = new Map(
        input.existingTags.map((tag) => [tag.id, tag]),
    );
    const tagUpserts = index.tags.filter((tag) =>
        tagChanged(tag, existingTagsById.get(tag.id)),
    );

    // 1. Ключи контента: сначала все кандидаты, потом отсев повторов.
    const takenKeys = new Set(
        input.questions
            .map((question) => question.contentKey)
            .filter((key): key is string => key !== null),
    );
    const candidates = new Map<
        string,
        Array<{ questionId: string; source: ContentKeySource }>
    >();
    const unresolvedKeyIds: string[] = [];
    for (const question of input.questions) {
        if (question.contentKey) {
            continue;
        }
        const resolved = resolveContentKey(
            {
                id: question.id,
                type: question.type,
                metadataDraftKey: readDraftKey(question.metadata),
                ruText: question.ruText,
            },
            input.draftText,
        );
        if (!resolved) {
            unresolvedKeyIds.push(question.id);
            continue;
        }
        const list = candidates.get(resolved.key) ?? [];
        list.push({ questionId: question.id, source: resolved.source });
        candidates.set(resolved.key, list);
    }

    const contentKeys: TaxonomySyncPlan['contentKeys'] = [];
    const duplicateKeys: string[] = [];
    for (const [key, list] of candidates) {
        if (list.length > 1 || takenKeys.has(key)) {
            duplicateKeys.push(key);
            continue;
        }
        contentKeys.push({
            questionId: list[0].questionId,
            contentKey: key,
            source: list[0].source,
        });
    }
    const keyById = new Map<string, string>();
    for (const question of input.questions) {
        if (question.contentKey) {
            keyById.set(question.id, question.contentKey);
        }
    }
    for (const item of contentKeys) {
        keyById.set(item.questionId, item.contentKey);
    }

    // 2. Метки каждого вопроса.
    const tagSources: Record<QuestionTagSource, number> = {
        override: 0,
        'draft-tags': 0,
        game: 0,
        none: 0,
    };
    const unknownGameNames = new Map<string, number>();
    const unknownRefs = new Set<string>();
    const untaggedPublished: TaxonomySyncPlan['report']['untaggedPublished'] =
        [];
    const wanted = new Map<string, Set<string>>();

    for (const question of input.questions) {
        const key = keyById.get(question.id) ?? null;
        const draft = key ? input.draftsByKey.get(key) : undefined;
        const result = deriveQuestionTags(index, {
            override: key ? input.overrides.questions[key] : undefined,
            draftTags: draft?.tags,
            gameNames: [
                readGameName(draft?.metadata),
                readGameName(question.metadata),
            ],
        });

        tagSources[result.source] += 1;
        result.unknownRefs.forEach((ref) => unknownRefs.add(ref));
        if (result.unknownGameName) {
            unknownGameNames.set(
                result.unknownGameName,
                (unknownGameNames.get(result.unknownGameName) ?? 0) + 1,
            );
        }
        if (
            result.tagIds.length === 0 &&
            question.publicationStatus === 'PUBLISHED' &&
            question.isActive
        ) {
            untaggedPublished.push({ id: question.id, contentKey: key });
        }
        wanted.set(question.id, new Set(result.tagIds));
    }

    // 3. Разница со связями в БД.
    const existingByQuestion = new Map<string, Set<string>>();
    for (const link of input.existingLinks) {
        const set =
            existingByQuestion.get(link.questionId) ?? new Set<string>();
        set.add(link.tagId);
        existingByQuestion.set(link.questionId, set);
    }

    const linksToAdd: TaxonomySyncPlan['linksToAdd'] = [];
    const linksToRemove: TaxonomySyncPlan['linksToRemove'] = [];
    const catalogTagIds = new Set(index.tags.map((tag) => tag.id));
    for (const [questionId, tagIds] of wanted) {
        const current = existingByQuestion.get(questionId) ?? new Set<string>();
        for (const tagId of tagIds) {
            if (!current.has(tagId)) {
                linksToAdd.push({ questionId, tagId });
            }
        }
        if (!input.prune) {
            continue;
        }
        for (const tagId of current) {
            if (!tagIds.has(tagId) && catalogTagIds.has(tagId)) {
                linksToRemove.push({ questionId, tagId });
            }
        }
    }

    // Ссылки из файла ручных меток проверяем целиком, даже для вопросов,
    // которых нет в этой базе: опечатка не должна ждать импорта.
    for (const refs of Object.values(input.overrides.questions)) {
        expandTagRefs(index, refs).unknownRefs.forEach((ref) =>
            unknownRefs.add(ref),
        );
    }

    return {
        tagUpserts,
        contentKeys,
        linksToAdd,
        linksToRemove,
        report: {
            tagSources,
            duplicateKeys,
            unresolvedKeyIds,
            unknownGameNames: [...unknownGameNames]
                .map(([name, count]) => ({ name, count }))
                .sort((left, right) => right.count - left.count),
            unknownRefs: [...unknownRefs].sort(),
            untaggedPublished,
        },
    };
}
