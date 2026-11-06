/**
 * Import пакета draft JSON как publicationStatus=DRAFT.
 *
 * Поток: validate → map (всех вопросов, до записи) → чтение целевой БД →
 * план (`planDraftImport`) → dry-run | createWithOptions по одному.
 * Никогда не выставляет PUBLISHED — это только admin publish + quality gate.
 *
 * Повторный запуск безопасен: вопросы, которые уже есть в БД (по
 * `contentKey` = draftKey или по RU-тексту), пропускаются. Оборванный
 * посередине импорт перезапускают той же командой. Новый вопрос получает
 * `contentKey = draftKey` тем же запросом, что создаёт строку.
 * Dry-run тоже читает БД (только SELECT), чтобы показать тот же план.
 *
 * См. docs/CONTENT_PIPELINE.md; DECISIONS → Draft import is re-runnable.
 */

import { questionRepository } from '@/entities/question/question.repository';
import {
    findQuestionsForDraftImport,
    type DraftImportExistingRow,
} from '@/entities/question/question-draft-import.repository';
import {
    createQuestionSchema,
    type CreateQuestionInput,
} from '@/features/admin/lib/validation';

import type { DraftQuestionsBatch } from './draft-questions.schema';
import { mapDraftQuestionToCreateInput } from './map-draft-to-create-input';
import {
    planDraftImport,
    type DraftImportSkipReason,
} from './plan-draft-import';
import {
    validateDraftQuestionsBatch,
    type DraftBatchValidationIssue,
    type DraftQuestionQualityReport,
} from './validate-draft-questions';

export type ImportDraftPlannedItem = {
    index: number;
    draftKey?: string;
    difficulty: DraftQuestionsBatch['questions'][number]['difficulty'];
};

export type ImportDraftCreatedItem = ImportDraftPlannedItem & {
    id: string;
};

export type ImportDraftSkippedItem = ImportDraftPlannedItem & {
    reason: DraftImportSkipReason;
    existingId: string;
    existingContentKey: string | null;
};

export type ImportDraftQuestionsResult =
    | {
          ok: false;
          stage: 'validate';
          issues: DraftBatchValidationIssue[];
      }
    | {
          ok: false;
          stage: 'publish_blockers';
          qualityReports: DraftQuestionQualityReport[];
      }
    | {
          ok: false;
          stage: 'map';
          index: number;
          draftKey?: string;
          message: string;
      }
    | {
          ok: false;
          /** Не удалось прочитать, что уже есть в БД, — ничего не записано. */
          stage: 'load';
          message: string;
      }
    | {
          ok: false;
          stage: 'create';
          index: number;
          draftKey?: string;
          message: string;
          createdBeforeFailure: ImportDraftCreatedItem[];
          skipped: ImportDraftSkippedItem[];
      }
    | {
          ok: true;
          dryRun: true;
          toCreate: ImportDraftPlannedItem[];
          skipped: ImportDraftSkippedItem[];
          qualityReports: DraftQuestionQualityReport[];
          hasPublishBlockers: boolean;
      }
    | {
          ok: true;
          dryRun: false;
          created: ImportDraftCreatedItem[];
          skipped: ImportDraftSkippedItem[];
          qualityReports: DraftQuestionQualityReport[];
          hasPublishBlockers: boolean;
      };

export type ImportDraftQuestionsOptions = {
    /** validate + map + чтение БД, без записи. */
    dryRun?: boolean;
    /** Не импортировать, если есть publish blockers. */
    failOnPublishBlockers?: boolean;
};

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

/**
 * Принимает уже распарсенный JSON (unknown).
 * Вызывающий CLI обязан загрузить .env до первого обращения к БД.
 */
export async function importDraftQuestionsBatch(
    input: unknown,
    options: ImportDraftQuestionsOptions = {},
): Promise<ImportDraftQuestionsResult> {
    const dryRun = options.dryRun === true;
    const failOnPublishBlockers = options.failOnPublishBlockers === true;

    const validated = validateDraftQuestionsBatch(input);

    if (!validated.ok) {
        return {
            ok: false,
            stage: 'validate',
            issues: validated.issues,
        };
    }

    if (failOnPublishBlockers && validated.hasPublishBlockers) {
        return {
            ok: false,
            stage: 'publish_blockers',
            qualityReports: validated.qualityReports,
        };
    }

    const questions = validated.batch.questions;

    // Map+Zod для всей партии до первой записи: несовместимый вопрос в
    // середине файла не оставит половину партии в БД.
    const mapped: CreateQuestionInput[] = [];
    for (const [index, question] of questions.entries()) {
        const parsed = createQuestionSchema.safeParse(
            mapDraftQuestionToCreateInput(question),
        );

        if (!parsed.success) {
            return {
                ok: false,
                stage: 'map',
                index,
                draftKey: question.draftKey,
                message: parsed.error.issues
                    .map((issue) => issue.message)
                    .join('; '),
            };
        }
        mapped.push(parsed.data);
    }

    let existing: DraftImportExistingRow[];
    try {
        existing = await findQuestionsForDraftImport(
            questions.flatMap((question) =>
                question.draftKey ? [question.draftKey] : [],
            ),
        );
    } catch (error) {
        return {
            ok: false,
            stage: 'load',
            message: errorMessage(error, 'Unknown read error'),
        };
    }

    const decisions = planDraftImport(
        questions.map((question, index) => ({
            index,
            draftKey: question.draftKey,
            ruText: question.translations.ru.text,
        })),
        existing,
    );

    const toCreate: ImportDraftPlannedItem[] = [];
    const skipped: ImportDraftSkippedItem[] = [];
    for (const decision of decisions) {
        const item: ImportDraftPlannedItem = {
            index: decision.index,
            draftKey: decision.draftKey,
            difficulty: questions[decision.index].difficulty,
        };
        if (decision.action === 'create') {
            toCreate.push(item);
        } else {
            skipped.push({
                ...item,
                reason: decision.reason,
                existingId: decision.existingId,
                existingContentKey: decision.existingContentKey,
            });
        }
    }

    if (dryRun) {
        return {
            ok: true,
            dryRun: true,
            toCreate,
            skipped,
            qualityReports: validated.qualityReports,
            hasPublishBlockers: validated.hasPublishBlockers,
        };
    }

    const created: ImportDraftCreatedItem[] = [];

    for (const item of toCreate) {
        try {
            const row = await questionRepository.createWithOptions(
                mapped[item.index],
                { contentKey: item.draftKey ?? null },
            );
            created.push({ ...item, id: row.id });
        } catch (error) {
            return {
                ok: false,
                stage: 'create',
                index: item.index,
                draftKey: item.draftKey,
                message: errorMessage(error, 'Unknown create error'),
                createdBeforeFailure: created,
                skipped,
            };
        }
    }

    return {
        ok: true,
        dryRun: false,
        created,
        skipped,
        qualityReports: validated.qualityReports,
        hasPublishBlockers: validated.hasPublishBlockers,
    };
}
