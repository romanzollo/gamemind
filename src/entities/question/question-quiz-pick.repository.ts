/**
 * Quiz pick / display reads for session snapshot.
 *
 * Зачем отдельный модуль (§11.7): quiz start hot path (random pick + bilingual
 * texts + prompt image URL) не должен жить в одном файле с admin CRUD/list.
 * Scoring / snapshot write остаются в quiz-session.repository.
 *
 * Pool rule: в квиз попадают только isActive=true И publicationStatus=PUBLISHED.
 * DRAFT / IN_REVIEW и soft-hide (isActive=false) исключены. Snapshot write/read
 * и scoring math не меняются — только WHERE при выборе id.
 *
 * Hot path Direct pick (Classic/Timed): два коротких read-budget —
 * 1) только id (`ORDER BY RANDOM() LIMIT n`);
 * 2) bilingual resolve по id (как Daily).
 * Один тяжёлый RANDOM+JOINs в 12s на Windows+Neon ломал Classic 10Q,
 * пока 3/5Q ещё проходили. Legacy one-shot SQL — для in-client merged path.
 *
 * Публичный фасад: question.repository.ts реэкспортирует функции и методы.
 * См. docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import type { Client } from 'pg';

import { withDirectPgClient } from '@/lib/db/direct-pg';
import { defaultLocale, type Locale } from '@/shared/i18n';
import { shuffleArray } from '@/shared/utils';
import type { Difficulty, QuestionType } from '@/types';
import type {
    LocalizedSnapshotTexts,
    QuestionSnapshotBundleItem,
    QuestionSnapshotCandidate,
    QuestionSnapshotDisplayText,
} from '@/entities/question/question.types';

type SnapshotDisplayTextRow = {
    question_id: string;
    difficulty: Difficulty;
    question_text: string;
    question_type: string;
    prompt_image_url: string | null;
    option_id: string | null;
    option_text: string | null;
    is_correct: boolean | null;
};

type SnapshotBilingualDisplayTextRow = {
    question_id: string;
    difficulty: Difficulty;
    question_type: string;
    question_text_ru: string;
    question_text_en: string;
    prompt_image_url: string | null;
    option_id: string | null;
    option_text_ru: string | null;
    option_text_en: string | null;
    is_correct: boolean | null;
};

type QuestionSnapshotCandidateRow = {
    question_id: string;
    option_id: string | null;
};

const RESOLVED_QUESTION_TEXT_SQL = `
    COALESCE(
        NULLIF(TRIM(qt_active."text"), ''),
        NULLIF(TRIM(qt_default."text"), ''),
        q."text"
    )
`;

const RESOLVED_OPTION_TEXT_SQL = `
    COALESCE(
        NULLIF(TRIM(aot_active."text"), ''),
        NULLIF(TRIM(aot_default."text"), ''),
        ao."text"
    )
`;

const RESOLVED_QUESTION_TEXT_RU_SQL = `
    COALESCE(
        NULLIF(TRIM(qt_ru."text"), ''),
        q."text"
    )
`;

const RESOLVED_QUESTION_TEXT_EN_SQL = `
    COALESCE(
        NULLIF(TRIM(qt_en."text"), ''),
        NULLIF(TRIM(qt_ru."text"), ''),
        q."text"
    )
`;

const RESOLVED_OPTION_TEXT_RU_SQL = `
    COALESCE(
        NULLIF(TRIM(aot_ru."text"), ''),
        ao."text"
    )
`;

const RESOLVED_OPTION_TEXT_EN_SQL = `
    COALESCE(
        NULLIF(TRIM(aot_en."text"), ''),
        NULLIF(TRIM(aot_ru."text"), ''),
        ao."text"
    )
`;

const PROMPT_IMAGE_URL_SQL = `
    (
        SELECT qa."url"
        FROM "QuestionAsset" qa
        WHERE qa."questionId" = q."id"
            AND qa."role" = 'PROMPT'::"QuestionAssetRole"
        ORDER BY qa."order" ASC, qa."id" ASC
        LIMIT 1
    )
`;

const BILINGUAL_QUESTION_TRANSLATION_JOINS_SQL = `
    LEFT JOIN "QuestionTranslation" qt_ru
        ON qt_ru."questionId" = q."id"
        AND qt_ru."locale" = 'ru'::"ContentLocale"
    LEFT JOIN "QuestionTranslation" qt_en
        ON qt_en."questionId" = q."id"
        AND qt_en."locale" = 'en'::"ContentLocale"
`;

const BILINGUAL_OPTION_TRANSLATION_JOINS_SQL = `
    LEFT JOIN "AnswerOptionTranslation" aot_ru
        ON aot_ru."optionId" = ao."id"
        AND aot_ru."locale" = 'ru'::"ContentLocale"
    LEFT JOIN "AnswerOptionTranslation" aot_en
        ON aot_en."optionId" = ao."id"
        AND aot_en."locale" = 'en'::"ContentLocale"
`;

function toQuestionType(value: string): QuestionType {
    return value === 'IMAGE_GUESS' ? 'IMAGE_GUESS' : 'TEXT';
}

function pickLocalizedText(
    texts: LocalizedSnapshotTexts,
    locale: Locale,
): string {
    const preferred = texts[locale]?.trim();
    if (preferred) {
        return preferred;
    }

    const fallback = texts[defaultLocale]?.trim();
    if (fallback) {
        return fallback;
    }

    return texts.ru || texts.en || '';
}

function snapshotQuestionTranslationJoinsSql(
    activeLocaleParam: string,
    defaultLocaleParam: string,
) {
    return `
    LEFT JOIN "QuestionTranslation" qt_active
        ON qt_active."questionId" = q."id"
        AND qt_active."locale" = ${activeLocaleParam}::"ContentLocale"
    LEFT JOIN "QuestionTranslation" qt_default
        ON qt_default."questionId" = q."id"
        AND qt_default."locale" = ${defaultLocaleParam}::"ContentLocale"
`;
}

function snapshotOptionTranslationJoinsSql(
    activeLocaleParam: string,
    defaultLocaleParam: string,
) {
    return `
    LEFT JOIN "AnswerOptionTranslation" aot_active
        ON aot_active."optionId" = ao."id"
        AND aot_active."locale" = ${activeLocaleParam}::"ContentLocale"
    LEFT JOIN "AnswerOptionTranslation" aot_default
        ON aot_default."optionId" = ao."id"
        AND aot_default."locale" = ${defaultLocaleParam}::"ContentLocale"
`;
}

async function loadSnapshotCandidatesByDifficulty(
    difficulty: Difficulty,
): Promise<QuestionSnapshotCandidate[]> {
    const result = await withDirectPgClient((client) => {
        return client.query<QuestionSnapshotCandidateRow>(
            `
                SELECT
                    q."id" AS "question_id",
                    ao."id" AS "option_id"
                FROM "Question" q
                LEFT JOIN "AnswerOption" ao
                    ON ao."questionId" = q."id"
                WHERE
                    q."difficulty" = $1::"Difficulty"
                    AND q."isActive" = true
                    AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
                ORDER BY q."createdAt" ASC, ao."order" ASC
            `,
            [difficulty],
        );
    });

    const questions = new Map<string, QuestionSnapshotCandidate>();

    for (const row of result.rows) {
        const existing = questions.get(row.question_id);

        if (existing) {
            if (row.option_id) {
                existing.options.push({ id: row.option_id });
            }
        } else {
            questions.set(row.question_id, {
                id: row.question_id,
                options: row.option_id ? [{ id: row.option_id }] : [],
            });
        }
    }

    return Array.from(questions.values());
}

function groupSnapshotBundleRows(
    rows: SnapshotDisplayTextRow[],
    locale: Locale = defaultLocale,
): QuestionSnapshotBundleItem[] {
    const questions: QuestionSnapshotBundleItem[] = [];
    const byId = new Map<string, QuestionSnapshotBundleItem>();

    for (const row of rows) {
        if (!row.option_id || !row.option_text) {
            continue;
        }

        let question = byId.get(row.question_id);

        if (!question) {
            const displayTexts: LocalizedSnapshotTexts = {
                ru: locale === 'ru' ? row.question_text : '',
                en: locale === 'en' ? row.question_text : '',
            };
            displayTexts.ru = displayTexts.ru || row.question_text;
            displayTexts.en = displayTexts.en || row.question_text;

            question = {
                id: row.question_id,
                difficulty: row.difficulty,
                type: toQuestionType(row.question_type),
                displayText: pickLocalizedText(displayTexts, locale),
                displayTexts,
                displayImageUrl: row.prompt_image_url,
                options: [],
            };
            byId.set(row.question_id, question);
            questions.push(question);
        }

        const optionTexts: LocalizedSnapshotTexts = {
            ru: locale === 'ru' ? row.option_text : '',
            en: locale === 'en' ? row.option_text : '',
        };
        optionTexts.ru = optionTexts.ru || row.option_text;
        optionTexts.en = optionTexts.en || row.option_text;

        question.options.push({
            id: row.option_id,
            displayText: pickLocalizedText(optionTexts, locale),
            displayTexts: optionTexts,
            isCorrect: row.is_correct ?? false,
        });
    }

    for (const question of questions) {
        if (question.options.length === 0) {
            throw new Error(`Question ${question.id} has no answer options`);
        }
    }

    return questions;
}

function groupBilingualSnapshotBundleRows(
    rows: SnapshotBilingualDisplayTextRow[],
    locale: Locale,
): QuestionSnapshotBundleItem[] {
    const questions: QuestionSnapshotBundleItem[] = [];
    const byId = new Map<string, QuestionSnapshotBundleItem>();

    for (const row of rows) {
        if (!row.option_id) {
            continue;
        }

        const optionTextRu =
            row.option_text_ru?.trim() || row.option_text_en?.trim() || '';
        const optionTextEn =
            row.option_text_en?.trim() || row.option_text_ru?.trim() || '';

        if (!optionTextRu && !optionTextEn) {
            continue;
        }

        let question = byId.get(row.question_id);

        if (!question) {
            const displayTexts: LocalizedSnapshotTexts = {
                ru: row.question_text_ru,
                en: row.question_text_en,
            };

            question = {
                id: row.question_id,
                difficulty: row.difficulty,
                type: toQuestionType(row.question_type),
                displayText: pickLocalizedText(displayTexts, locale),
                displayTexts,
                displayImageUrl: row.prompt_image_url,
                options: [],
            };
            byId.set(row.question_id, question);
            questions.push(question);
        }

        const optionTexts: LocalizedSnapshotTexts = {
            ru: optionTextRu,
            en: optionTextEn,
        };

        question.options.push({
            id: row.option_id,
            displayText: pickLocalizedText(optionTexts, locale),
            displayTexts: optionTexts,
            isCorrect: row.is_correct ?? false,
        });
    }

    for (const question of questions) {
        if (question.options.length === 0) {
            throw new Error(`Question ${question.id} has no answer options`);
        }
    }

    return questions;
}

function mapSnapshotBundleToDisplayTexts(
    bundle: QuestionSnapshotBundleItem[],
): Map<string, QuestionSnapshotDisplayText> {
    const displayTexts = new Map<string, QuestionSnapshotDisplayText>();

    for (const question of bundle) {
        const optionTexts = new Map<string, string>();

        for (const option of question.options) {
            optionTexts.set(option.id, option.displayText);
        }

        displayTexts.set(question.id, {
            questionId: question.id,
            displayText: question.displayText,
            options: optionTexts,
        });
    }

    return displayTexts;
}

async function loadSnapshotDisplayTextRowsByQuestionIds(
    locale: Locale,
    questionIds: string[],
): Promise<SnapshotDisplayTextRow[]> {
    if (questionIds.length === 0) {
        return [];
    }

    const result = await withDirectPgClient((client) =>
        client.query<SnapshotDisplayTextRow>(
            `
                SELECT
                    q."id" AS question_id,
                    q."difficulty"::text AS difficulty,
                    q."type"::text AS question_type,
                    ${RESOLVED_QUESTION_TEXT_SQL} AS question_text,
                    ${PROMPT_IMAGE_URL_SQL} AS prompt_image_url,
                    ao."id" AS option_id,
                    ${RESOLVED_OPTION_TEXT_SQL} AS option_text,
                    ao."isCorrect" AS is_correct
                FROM "Question" q
                INNER JOIN "AnswerOption" ao
                    ON ao."questionId" = q."id"
                ${snapshotQuestionTranslationJoinsSql('$1', '$2')}
                ${snapshotOptionTranslationJoinsSql('$1', '$2')}
                WHERE q."id" = ANY($3::text[])
                ORDER BY array_position($3::text[], q."id"), ao."order" ASC
            `,
            [locale, defaultLocale, questionIds],
        ),
    );

    return result.rows;
}

/**
 * Resolve display texts for question/option IDs at a locale.
 * Used as overlay for legacy v1 snapshots when the UI locale differs.
 */
export async function loadLocalizedTextsByQuestionIds(
    locale: Locale,
    questionIds: string[],
): Promise<Map<string, QuestionSnapshotDisplayText>> {
    const rows = await loadSnapshotDisplayTextRowsByQuestionIds(
        locale,
        questionIds,
    );

    return mapSnapshotBundleToDisplayTexts(
        groupSnapshotBundleRows(rows, locale),
    );
}

export async function loadRandomSnapshotBundleWithPgClient(
    client: Client,
    difficulty: Difficulty,
    limit: number,
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    const result = await client.query<SnapshotBilingualDisplayTextRow>(
        `
                WITH random_ids AS (
                    SELECT id, ord::int - 1 AS pick_position
                    FROM unnest((
                        SELECT ARRAY(
                            SELECT q."id"
                            FROM "Question" q
                            WHERE
                                q."difficulty" = $1::"Difficulty"
                                AND q."isActive" = true
                                AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
                            ORDER BY RANDOM()
                            LIMIT $2
                        )
                    )::text[]) WITH ORDINALITY AS t(id, ord)
                )
                SELECT
                    q."id" AS question_id,
                    q."difficulty"::text AS difficulty,
                    q."type"::text AS question_type,
                    ${RESOLVED_QUESTION_TEXT_RU_SQL} AS question_text_ru,
                    ${RESOLVED_QUESTION_TEXT_EN_SQL} AS question_text_en,
                    ${PROMPT_IMAGE_URL_SQL} AS prompt_image_url,
                    ao."id" AS option_id,
                    ${RESOLVED_OPTION_TEXT_RU_SQL} AS option_text_ru,
                    ${RESOLVED_OPTION_TEXT_EN_SQL} AS option_text_en,
                    ao."isCorrect" AS is_correct
                FROM random_ids ri
                INNER JOIN "Question" q
                    ON q."id" = ri.id
                INNER JOIN "AnswerOption" ao
                    ON ao."questionId" = q."id"
                ${BILINGUAL_QUESTION_TRANSLATION_JOINS_SQL}
                ${BILINGUAL_OPTION_TRANSLATION_JOINS_SQL}
                ORDER BY ri.pick_position, ao."order" ASC
            `,
        [difficulty, limit],
    );

    return groupBilingualSnapshotBundleRows(result.rows, locale);
}

/**
 * Bilingual snapshot bundle for a frozen id list (Daily Challenge).
 * Порядок = порядок `questionIds`. Без isActive/PUBLISHED фильтра:
 * freeze дня важнее поздней деактивации (иначе второй игрок дня сломается).
 */
export async function loadSnapshotBundleByQuestionIdsWithPgClient(
    client: Client,
    questionIds: string[],
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    if (questionIds.length === 0) {
        return [];
    }

    const result = await client.query<SnapshotBilingualDisplayTextRow>(
        `
                WITH ordered_ids AS (
                    SELECT id, ord::int - 1 AS pick_position
                    FROM unnest($1::text[]) WITH ORDINALITY AS t(id, ord)
                )
                SELECT
                    q."id" AS question_id,
                    q."difficulty"::text AS difficulty,
                    q."type"::text AS question_type,
                    ${RESOLVED_QUESTION_TEXT_RU_SQL} AS question_text_ru,
                    ${RESOLVED_QUESTION_TEXT_EN_SQL} AS question_text_en,
                    ${PROMPT_IMAGE_URL_SQL} AS prompt_image_url,
                    ao."id" AS option_id,
                    ${RESOLVED_OPTION_TEXT_RU_SQL} AS option_text_ru,
                    ${RESOLVED_OPTION_TEXT_EN_SQL} AS option_text_en,
                    ao."isCorrect" AS is_correct
                FROM ordered_ids oi
                INNER JOIN "Question" q
                    ON q."id" = oi.id
                INNER JOIN "AnswerOption" ao
                    ON ao."questionId" = q."id"
                ${BILINGUAL_QUESTION_TRANSLATION_JOINS_SQL}
                ${BILINGUAL_OPTION_TRANSLATION_JOINS_SQL}
                ORDER BY oi.pick_position, ao."order" ASC
            `,
        [questionIds],
    );

    return groupBilingualSnapshotBundleRows(result.rows, locale);
}

/**
 * Лёгкий pick: только id (без translation/option JOINs).
 * Тяжёлый bilingual resolve — отдельным Direct-budget по списку id.
 */
async function pickRandomActiveQuestionIdsWithPgClient(
    client: Client,
    difficulty: Difficulty,
    limit: number,
): Promise<string[]> {
    const result = await client.query<{ id: string }>(
        `
            SELECT q."id"
            FROM "Question" q
            WHERE
                q."difficulty" = $1::"Difficulty"
                AND q."isActive" = true
                AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
            ORDER BY RANDOM()
            LIMIT $2
        `,
        [difficulty, limit],
    );

    return result.rows.map((row) => row.id);
}

async function loadSnapshotBundleByQuestionIdsWithDirectPg(
    questionIds: string[],
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    return withDirectPgClient((client) =>
        loadSnapshotBundleByQuestionIdsWithPgClient(
            client,
            questionIds,
            locale,
        ),
    );
}

/**
 * Classic/Timed hot path: id-pick и resolve — разные Direct reads (свой 12s
 * budget + retry у каждого). Не склеивать RANDOM + bilingual JOINs в один
 * wall-clock timeout: на 10Q Windows+Neon давал ложный DB_TIMEOUT при живых 3/5Q.
 */
async function loadRandomSnapshotBundleWithDirectPg(
    difficulty: Difficulty,
    limit: number,
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    const questionIds = await withDirectPgClient((client) =>
        pickRandomActiveQuestionIdsWithPgClient(client, difficulty, limit),
    );

    if (questionIds.length === 0) {
        return [];
    }

    return loadSnapshotBundleByQuestionIdsWithDirectPg(questionIds, locale);
}

/** Методы quiz-pick для фасада questionRepository (без смены сигнатур). */
export const questionQuizPickMethods = {
    async pickRandomActiveForSnapshot(
        difficulty: Difficulty,
        limit: number,
    ): Promise<QuestionSnapshotCandidate[]> {
        const questions = await loadSnapshotCandidatesByDifficulty(difficulty);

        const shuffled = shuffleArray(questions);

        return shuffled.slice(0, limit).map((question) => {
            if (question.options.length === 0) {
                throw new Error(
                    `Question ${question.id} has no answer options`,
                );
            }

            return {
                id: question.id,
                options: question.options,
            };
        });
    },

    pickRandomActiveSnapshotBundle(
        difficulty: Difficulty,
        limit: number,
        locale: Locale,
    ): Promise<QuestionSnapshotBundleItem[]> {
        return loadRandomSnapshotBundleWithDirectPg(difficulty, limit, locale);
    },

    /**
     * Bundle по фиксированному списку id (Daily Challenge freeze).
     * Порядок вопросов сохраняется; варианты в action всё ещё shuffle.
     */
    pickSnapshotBundleByQuestionIds(
        questionIds: string[],
        locale: Locale,
    ): Promise<QuestionSnapshotBundleItem[]> {
        return loadSnapshotBundleByQuestionIdsWithDirectPg(questionIds, locale);
    },

    async findSnapshotDisplayTextsByCandidates(
        locale: Locale,
        candidates: QuestionSnapshotCandidate[],
    ): Promise<Map<string, QuestionSnapshotDisplayText>> {
        if (candidates.length === 0) {
            return new Map();
        }

        const questionIds = candidates.map((candidate) => candidate.id);
        const rows = await loadSnapshotDisplayTextRowsByQuestionIds(
            locale,
            questionIds,
        );

        return mapSnapshotBundleToDisplayTexts(
            groupSnapshotBundleRows(rows, locale),
        );
    },
};
