// Репозиторий для работы с вопросами в БД

import { randomUUID } from 'node:crypto';

import type { ContentLocale } from '@prisma/client';
import type { Client } from 'pg';
import { defaultLocale, type Locale } from '@/shared/i18n';
import type { AdminQuestionListFilters } from '@/features/admin/lib/parse-admin-question-list-filters';
import type {
    CreateQuestionInput,
    UpdateQuestionInput,
} from '@/features/admin/lib/validation';
import type { Difficulty, QuestionType } from '@/types';
import {
    isTransientDirectPgError,
    withDirectPgClient,
    withDirectPgWriteRetry,
} from '@/lib/db/direct-pg';
import { shuffleArray } from '@/shared/utils';

// кандидат для snapshot: id вопроса + id вариантов
export type QuestionSnapshotCandidate = {
    id: string;
    options: Array<{ id: string }>;
};

export type QuestionSnapshotDisplayText = {
    questionId: string;
    displayText: string;
    options: Map<string, string>;
};

export type LocalizedSnapshotTexts = {
    ru: string;
    en: string;
};

export type QuestionSnapshotBundleItem = {
    id: string;
    difficulty: Difficulty;
    type: QuestionType;
    displayText: string;
    displayTexts: LocalizedSnapshotTexts;
    displayImageUrl: string | null;
    options: Array<{
        id: string;
        displayText: string;
        displayTexts: LocalizedSnapshotTexts;
        isCorrect: boolean;
    }>;
};

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

/**
 * Admin list read: serialized fresh Client → Neon **pooler**.
 *
 * Почему не Pool max:1 + Promise.race:
 * - при wall-clock timeout race отклонялся, а client оставался checked-out
 *   → следующий GET (Сброс) ждал слот вечно / connect timeout;
 * - shared Pool после «грязного» simple/extended query клинил в next dev.
 *
 * Почему не параллельные fresh Client:
 * - на Windows + Neon параллельный TLS wedge; teardown без destroy ~10–19s
 *   клинит следующий soft-nav/Reset.
 *
 * Паттерн: очередь (один list за раз) + withDirectPgClient (unpooled)
 * (timeout → socket.destroy, затем retry). Quiz/snapshot не трогаем.
 *
 * Cold start Neon (~10–15s) смягчаем: warmAdminListConnection (dev keep-warm
 * + ping с admin hub) и TTL-кэш PROMPT urls (второй connect не на каждый GET).
 * После каждого connect очередь держит ~300ms — hard-nav Сброс не стартует
 * TLS, пока предыдущий end() ещё клинит Windows+Neon.
 */
const globalForAdminListPg = globalThis as unknown as {
    adminListTail?: Promise<unknown>;
    adminPromptCache?: {
        at: number;
        map: Map<string, string>;
    };
};

/** Кэш thumbs: после мутаций сбрасываем; TTL страхует от долгой stale. */
const ADMIN_PROMPT_CACHE_TTL_MS = 60_000;

function getCachedAdminPrompts(): Map<string, string> | null {
    const cache = globalForAdminListPg.adminPromptCache;
    if (!cache) {
        return null;
    }
    if (Date.now() - cache.at > ADMIN_PROMPT_CACHE_TTL_MS) {
        return null;
    }
    return cache.map;
}

function setCachedAdminPrompts(map: Map<string, string>) {
    globalForAdminListPg.adminPromptCache = {
        at: Date.now(),
        map,
    };
}

function invalidateAdminPromptCache() {
    globalForAdminListPg.adminPromptCache = undefined;
}

async function withAdminListPgClient<T>(
    operation: (client: Client) => Promise<T>,
): Promise<T> {
    const previous = globalForAdminListPg.adminListTail ?? Promise.resolve();
    let releaseTail!: () => void;
    const tail = new Promise<void>((resolve) => {
        releaseTail = resolve;
    });
    globalForAdminListPg.adminListTail = previous.then(
        () => tail,
        () => tail,
    );

    await previous.catch(() => undefined);

    const started = Date.now();

    try {
        // Unpooled: pooler + hard-nav Reset после filter чаще клинил connect
        // во время teardown предыдущего TLS. Quiz/snapshot не трогаем.
        const value = await withDirectPgClient(operation);

        if (process.env.NODE_ENV === 'development') {
            console.info(`[admin-list-pg] ok ${Date.now() - started}ms`);
        }

        return value;
    } catch (error) {
        if (process.env.NODE_ENV === 'development') {
            console.warn(
                `[admin-list-pg] fail ${Date.now() - started}ms:`,
                error instanceof Error ? error.message : error,
            );
        }

        throw error;
    } finally {
        // Не отпускать очередь, пока socket.destroy/end предыдущего client
        // не успеет осесть — иначе следующий hard-nav (Сброс) клинит TLS.
        await new Promise((resolve) => setTimeout(resolve, 300));
        releaseTail();
    }
}

/**
 * Лёгкий ping по той же очереди, что admin list.
 * Будит Neon до открытия /admin/questions; не держит Pool-слот.
 */
export async function warmAdminListConnection(): Promise<void> {
    await withAdminListPgClient(async (client) => {
        await client.query('SELECT 1');
    });
}

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

type QuestionSnapshotCandidateRow = {
    question_id: string;
    option_id: string | null;
};

type TranslationRow = {
    locale: ContentLocale;
    text: string;
};

// перевод текста вопроса или варианта ответа
function pickTranslationText(
    translations: TranslationRow[],
    locale: Locale,
    legacyText?: string,
): string {
    const preferred = translations.find((row) => row.locale === locale)?.text;
    if (preferred?.trim()) {
        return preferred;
    }

    const fallback = translations.find(
        (row) => row.locale === defaultLocale,
    )?.text;
    if (fallback?.trim()) {
        return fallback;
    }

    if (legacyText) {
        return legacyText;
    }

    return translations[0]?.text ?? '';
}

export type LocalizedAdminText = {
    ru: { text: string };
    en: { text: string };
};

export type AdminQuestionForEdit = {
    id: string;
    type: QuestionType;
    promptImageUrl: string | null;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    translations: LocalizedAdminText;
    options: Array<{
        id: string;
        isCorrect: boolean;
        order: number;
        translations: LocalizedAdminText;
    }>;
};

function buildAdminTranslations(
    translations: TranslationRow[],
    legacyText: string,
): LocalizedAdminText {
    return {
        ru: {
            text:
                translations.find((row) => row.locale === 'ru')?.text ??
                legacyText,
        },
        en: {
            text:
                translations.find((row) => row.locale === 'en')?.text?.trim() ||
                translations.find((row) => row.locale === 'ru')?.text?.trim() ||
                legacyText,
        },
    };
}

function groupOptionTranslationsByOptionId(
    rows: Array<{
        optionId: string;
        locale: ContentLocale;
        text: string;
    }>,
) {
    const grouped = new Map<string, TranslationRow[]>();

    for (const row of rows) {
        const existing = grouped.get(row.optionId);

        if (existing) {
            existing.push({ locale: row.locale, text: row.text });
        } else {
            grouped.set(row.optionId, [
                { locale: row.locale, text: row.text },
            ]);
        }
    }

    return grouped;
}

function buildValuesPlaceholder(
    rowCount: number,
    columnCount: number,
    startIndex = 1,
) {
    return Array.from({ length: rowCount }, (_, rowIndex) => {
        const columns = Array.from({ length: columnCount }, (_, columnIndex) => {
            return `$${startIndex + rowIndex * columnCount + columnIndex}`;
        });

        return `(${columns.join(', ')})`;
    }).join(', ');
}

function adminQuestionMatchesUpdateInput(
    question: AdminQuestionForEdit,
    input: UpdateQuestionInput,
) {
    if (
        question.type !== input.type ||
        (question.promptImageUrl ?? '') !== (input.promptImageUrl?.trim() ?? '') ||
        question.difficulty !== input.difficulty ||
        question.category !== input.category ||
        question.translations.ru.text !== input.translations.ru.text ||
        question.translations.en.text !== input.translations.en.text ||
        question.options.length !== input.options.length
    ) {
        return false;
    }

    for (const inputOption of input.options) {
        const currentOption = question.options.find(
            (option) => option.id === inputOption.id,
        );

        if (!currentOption) {
            return false;
        }

        if (
            currentOption.isCorrect !== inputOption.isCorrect ||
            currentOption.order !== inputOption.order ||
            currentOption.translations.ru.text !==
                inputOption.translations.ru.text ||
            currentOption.translations.en.text !==
                inputOption.translations.en.text
        ) {
            return false;
        }
    }

    return true;
}

async function findByIdForAdminWithDirectPg(
    id: string,
): Promise<AdminQuestionForEdit | null> {
    return withDirectPgClient(async (client) => {
        const questionResult = await client.query<{
            id: string;
            text: string;
            type: QuestionType;
            promptImageUrl: string | null;
            difficulty: Difficulty;
            category: string;
            isActive: boolean;
        }>(
            `
                SELECT
                    q."id",
                    q."text",
                    q."type"::text AS "type",
                    (
                        SELECT qa."url"
                        FROM "QuestionAsset" qa
                        WHERE
                            qa."questionId" = q."id"
                            AND qa."role" = 'PROMPT'::"QuestionAssetRole"
                        ORDER BY qa."order" ASC, qa."id" ASC
                        LIMIT 1
                    ) AS "promptImageUrl",
                    q."difficulty"::text AS "difficulty",
                    q."category",
                    q."isActive"
                FROM "Question" q
                WHERE q."id" = $1
            `,
            [id],
        );

        const row = questionResult.rows[0];

        if (!row) {
            return null;
        }

        const optionsResult = await client.query<{
            id: string;
            text: string;
            isCorrect: boolean;
            order: number;
        }>(
            `
                SELECT "id", "text", "isCorrect", "order"
                FROM "AnswerOption"
                WHERE "questionId" = $1
                ORDER BY "order" ASC
            `,
            [id],
        );

        const questionTranslationsResult = await client.query<TranslationRow>(
            `
                SELECT "locale"::text AS "locale", "text"
                FROM "QuestionTranslation"
                WHERE "questionId" = $1
            `,
            [id],
        );

        const optionIds = optionsResult.rows.map((option) => option.id);
        const optionTranslationRows =
            optionIds.length === 0
                ? []
                : (
                      await client.query<{
                          optionId: string;
                          locale: ContentLocale;
                          text: string;
                      }>(
                          `
                              SELECT
                                  "optionId",
                                  "locale"::text AS "locale",
                                  "text"
                              FROM "AnswerOptionTranslation"
                              WHERE "optionId" = ANY($1::text[])
                          `,
                          [optionIds],
                      )
                  ).rows;

        const optionTranslationsByOptionId =
            groupOptionTranslationsByOptionId(optionTranslationRows);

        return {
            id: row.id,
            type: row.type,
            promptImageUrl: row.promptImageUrl,
            difficulty: row.difficulty,
            category: row.category,
            isActive: row.isActive,
            translations: buildAdminTranslations(
                questionTranslationsResult.rows,
                row.text,
            ),
            options: optionsResult.rows.map((option) => ({
                id: option.id,
                isCorrect: option.isCorrect,
                order: option.order,
                translations: buildAdminTranslations(
                    optionTranslationsByOptionId.get(option.id) ?? [],
                    option.text,
                ),
            })),
        };
    });
}

async function recoverAdminUpdateAfterWriteError(
    input: UpdateQuestionInput,
    error: unknown,
): Promise<{ id: string } | null> {
    if (!isTransientDirectPgError(error)) {
        return null;
    }

    const current = await findByIdForAdminWithDirectPg(input.questionId).catch(
        () => null,
    );

    if (!current || !adminQuestionMatchesUpdateInput(current, input)) {
        return null;
    }

    return { id: input.questionId };
}

async function applyAdminQuestionCreateWithPg(
    client: Client,
    questionId: string,
    input: CreateQuestionInput,
): Promise<{ id: string }> {
    const promptImageUrl = input.promptImageUrl?.trim() ?? '';
    const assetId = `qa-${questionId}-prompt`;
    const promptAsset = input.promptAsset;
    const optionRows = input.options.map((option) => ({
        id: `${questionId}-opt-${option.order}`,
        text: option.translations.ru.text,
        isCorrect: option.isCorrect,
        order: option.order,
    }));
    const questionTranslationRows = [
        {
            id: `qt-${questionId}-ru`,
            questionId,
            locale: 'ru' as const,
            text: input.translations.ru.text,
        },
        {
            id: `qt-${questionId}-en`,
            questionId,
            locale: 'en' as const,
            text: input.translations.en.text,
        },
    ];
    const optionTranslationRows = input.options.flatMap((option, index) => {
        const optionId = optionRows[index].id;

        return [
            {
                id: `aot-${optionId}-ru`,
                optionId,
                locale: 'ru' as const,
                text: option.translations.ru.text,
            },
            {
                id: `aot-${optionId}-en`,
                optionId,
                locale: 'en' as const,
                text: option.translations.en.text,
            },
        ];
    });

    const questionParams = [
        questionId,
        input.translations.ru.text,
        input.type,
        input.difficulty,
        input.category,
        promptImageUrl,
        assetId,
        promptAsset?.storageKey ?? null,
        promptAsset?.mimeType ?? null,
        promptAsset?.width ?? null,
        promptAsset?.height ?? null,
        promptAsset?.byteSize ?? null,
    ];
    const questionTranslationParams = questionTranslationRows.flatMap((row) => [
        row.id,
        row.questionId,
        row.locale,
        row.text,
    ]);
    const optionParams = optionRows.flatMap((row) => [
        row.id,
        questionId,
        row.text,
        row.isCorrect,
        row.order,
    ]);
    const optionTranslationParams = optionTranslationRows.flatMap((row) => [
        row.id,
        row.optionId,
        row.locale,
        row.text,
    ]);
    const allParams = [
        ...questionParams,
        ...questionTranslationParams,
        ...optionParams,
        ...optionTranslationParams,
    ];

    const questionTranslationStart = questionParams.length + 1;
    const optionStart =
        questionTranslationStart + questionTranslationParams.length;
    const optionTranslationStart = optionStart + optionParams.length;

    const result = await client.query<{
        question_count: number;
        option_count: number;
        question_translation_count: number;
        option_translation_count: number;
    }>(
        `
            WITH upsert_question AS (
                INSERT INTO "Question" (
                    "id",
                    "text",
                    "type",
                    "difficulty",
                    "category",
                    "isActive",
                    "createdAt",
                    "updatedAt"
                )
                VALUES (
                    $1,
                    $2,
                    $3::"QuestionType",
                    $4::"Difficulty",
                    $5,
                    true,
                    NOW(),
                    NOW()
                )
                ON CONFLICT ("id") DO UPDATE SET
                    "text" = EXCLUDED."text",
                    "type" = EXCLUDED."type",
                    "difficulty" = EXCLUDED."difficulty",
                    "category" = EXCLUDED."category",
                    "isActive" = true,
                    "updatedAt" = NOW()
                RETURNING "id"
            ),
            upsert_prompt_asset AS (
                INSERT INTO "QuestionAsset" (
                    "id",
                    "questionId",
                    "role",
                    "url",
                    "storageKey",
                    "mimeType",
                    "width",
                    "height",
                    "byteSize",
                    "order"
                )
                SELECT
                    $7,
                    uq."id",
                    'PROMPT'::"QuestionAssetRole",
                    $6,
                    $8,
                    $9,
                    $10::int,
                    $11::int,
                    $12::int,
                    0
                FROM upsert_question uq
                WHERE
                    $3::"QuestionType" = 'IMAGE_GUESS'::"QuestionType"
                    AND NULLIF(BTRIM($6), '') IS NOT NULL
                ON CONFLICT ("id") DO UPDATE SET
                    "url" = EXCLUDED."url",
                    "storageKey" = COALESCE(EXCLUDED."storageKey", "QuestionAsset"."storageKey"),
                    "mimeType" = COALESCE(EXCLUDED."mimeType", "QuestionAsset"."mimeType"),
                    "width" = COALESCE(EXCLUDED."width", "QuestionAsset"."width"),
                    "height" = COALESCE(EXCLUDED."height", "QuestionAsset"."height"),
                    "byteSize" = COALESCE(EXCLUDED."byteSize", "QuestionAsset"."byteSize"),
                    "role" = EXCLUDED."role"
                RETURNING "id"
            ),
            question_translation_input("id", "questionId", "locale", "text") AS (
                VALUES ${buildValuesPlaceholder(
                    questionTranslationRows.length,
                    4,
                    questionTranslationStart,
                )}
            ),
            upsert_question_translations AS (
                INSERT INTO "QuestionTranslation" (
                    "id",
                    "questionId",
                    "locale",
                    "text"
                )
                SELECT
                    qti."id",
                    qti."questionId",
                    qti."locale"::"ContentLocale",
                    qti."text"
                FROM question_translation_input qti
                INNER JOIN upsert_question uq
                    ON uq."id" = qti."questionId"
                ON CONFLICT ("questionId", "locale")
                DO UPDATE SET "text" = EXCLUDED."text"
                RETURNING "id"
            ),
            option_input("id", "questionId", "text", "isCorrect", "order") AS (
                VALUES ${buildValuesPlaceholder(
                    optionRows.length,
                    5,
                    optionStart,
                )}
            ),
            upsert_options AS (
                INSERT INTO "AnswerOption" (
                    "id",
                    "questionId",
                    "text",
                    "isCorrect",
                    "order"
                )
                SELECT
                    oi."id",
                    oi."questionId",
                    oi."text",
                    oi."isCorrect"::boolean,
                    oi."order"::int
                FROM option_input oi
                INNER JOIN upsert_question uq
                    ON uq."id" = oi."questionId"
                ON CONFLICT ("id") DO UPDATE SET
                    "text" = EXCLUDED."text",
                    "isCorrect" = EXCLUDED."isCorrect",
                    "order" = EXCLUDED."order"
                RETURNING "id"
            ),
            option_translation_input("id", "optionId", "locale", "text") AS (
                VALUES ${buildValuesPlaceholder(
                    optionTranslationRows.length,
                    4,
                    optionTranslationStart,
                )}
            ),
            upsert_option_translations AS (
                INSERT INTO "AnswerOptionTranslation" (
                    "id",
                    "optionId",
                    "locale",
                    "text"
                )
                SELECT
                    oti."id",
                    oti."optionId",
                    oti."locale"::"ContentLocale",
                    oti."text"
                FROM option_translation_input oti
                INNER JOIN upsert_options uo
                    ON uo."id" = oti."optionId"
                ON CONFLICT ("optionId", "locale")
                DO UPDATE SET "text" = EXCLUDED."text"
                RETURNING "id"
            )
            SELECT
                (SELECT COUNT(*)::int FROM upsert_question) AS "question_count",
                (SELECT COUNT(*)::int FROM upsert_options) AS "option_count",
                (
                    SELECT COUNT(*)::int
                    FROM upsert_question_translations
                ) AS "question_translation_count",
                (
                    SELECT COUNT(*)::int
                    FROM upsert_option_translations
                ) AS "option_translation_count"
        `,
        allParams,
    );

    const summary = result.rows[0];

    if (
        !summary ||
        summary.question_count !== 1 ||
        summary.option_count !== optionRows.length ||
        summary.question_translation_count !== questionTranslationRows.length ||
        summary.option_translation_count !== optionTranslationRows.length
    ) {
        throw new Error(`Incomplete question create for ${questionId}`);
    }

    return { id: questionId };
}

async function createWithOptionsWithDirectPg(
    input: CreateQuestionInput,
): Promise<{ id: string }> {
    // id из action (после upload) или новый UUID
    const questionId = input.id?.trim() || randomUUID();

    return withDirectPgWriteRetry(
        (client) => applyAdminQuestionCreateWithPg(client, questionId, input),
        2,
    );
}

async function applyAdminQuestionUpdateWithPg(
    client: Client,
    input: UpdateQuestionInput,
): Promise<{ id: string } | null> {
    const questionTranslationRows = [
        {
            id: randomUUID(),
            questionId: input.questionId,
            locale: 'ru' as const,
            text: input.translations.ru.text,
        },
        {
            id: randomUUID(),
            questionId: input.questionId,
            locale: 'en' as const,
            text: input.translations.en.text,
        },
    ];
    const optionRows = input.options.map((option) => ({
        id: option.id,
        text: option.translations.ru.text,
        isCorrect: option.isCorrect,
        order: option.order,
    }));
    const optionTranslationRows = input.options.flatMap((option) => [
        {
            id: randomUUID(),
            optionId: option.id,
            locale: 'ru' as const,
            text: option.translations.ru.text,
        },
        {
            id: randomUUID(),
            optionId: option.id,
            locale: 'en' as const,
            text: option.translations.en.text,
        },
    ]);

    const promptImageUrl = input.promptImageUrl?.trim() ?? '';
    const assetId = `qa-${input.questionId}-prompt`;
    const promptAsset = input.promptAsset;

    const questionParams = [
        input.translations.ru.text,
        input.type,
        input.difficulty,
        input.category,
        input.questionId,
        promptImageUrl,
        assetId,
        promptAsset?.storageKey ?? null,
        promptAsset?.mimeType ?? null,
        promptAsset?.width ?? null,
        promptAsset?.height ?? null,
        promptAsset?.byteSize ?? null,
    ];
    const questionTranslationParams = questionTranslationRows.flatMap((row) => [
        row.id,
        row.questionId,
        row.locale,
        row.text,
    ]);
    const optionParams = optionRows.flatMap((row) => [
        row.id,
        row.text,
        row.isCorrect,
        row.order,
    ]);
    const optionTranslationParams = optionTranslationRows.flatMap((row) => [
        row.id,
        row.optionId,
        row.locale,
        row.text,
    ]);
    const allParams = [
        ...questionParams,
        ...questionTranslationParams,
        ...optionParams,
        ...optionTranslationParams,
    ];

    const questionTranslationStart = questionParams.length + 1;
    const optionStart =
        questionTranslationStart + questionTranslationParams.length;
    const optionTranslationStart = optionStart + optionParams.length;

    const result = await client.query<{
        question_count: number;
        option_count: number;
        question_translation_count: number;
        option_translation_count: number;
    }>(
        `
            WITH updated_question AS (
                UPDATE "Question"
                SET
                    "text" = $1,
                    "type" = $2::"QuestionType",
                    "difficulty" = $3::"Difficulty",
                    "category" = $4,
                    "updatedAt" = NOW()
                WHERE "id" = $5
                RETURNING "id"
            ),
            removed_prompt_assets AS (
                DELETE FROM "QuestionAsset" qa
                USING updated_question uq
                WHERE
                    qa."questionId" = uq."id"
                    AND qa."role" = 'PROMPT'::"QuestionAssetRole"
                    AND $2::"QuestionType" = 'TEXT'::"QuestionType"
                RETURNING qa."id"
            ),
            upsert_prompt_asset AS (
                INSERT INTO "QuestionAsset" (
                    "id",
                    "questionId",
                    "role",
                    "url",
                    "storageKey",
                    "mimeType",
                    "width",
                    "height",
                    "byteSize",
                    "order"
                )
                SELECT
                    $7,
                    uq."id",
                    'PROMPT'::"QuestionAssetRole",
                    $6,
                    $8,
                    $9,
                    $10::int,
                    $11::int,
                    $12::int,
                    0
                FROM updated_question uq
                WHERE
                    $2::"QuestionType" = 'IMAGE_GUESS'::"QuestionType"
                    AND NULLIF(BTRIM($6), '') IS NOT NULL
                ON CONFLICT ("id") DO UPDATE SET
                    "url" = EXCLUDED."url",
                    "storageKey" = COALESCE(EXCLUDED."storageKey", "QuestionAsset"."storageKey"),
                    "mimeType" = COALESCE(EXCLUDED."mimeType", "QuestionAsset"."mimeType"),
                    "width" = COALESCE(EXCLUDED."width", "QuestionAsset"."width"),
                    "height" = COALESCE(EXCLUDED."height", "QuestionAsset"."height"),
                    "byteSize" = COALESCE(EXCLUDED."byteSize", "QuestionAsset"."byteSize"),
                    "role" = EXCLUDED."role"
                RETURNING "id"
            ),
            question_translation_input("id", "questionId", "locale", "text") AS (
                VALUES ${buildValuesPlaceholder(
                    questionTranslationRows.length,
                    4,
                    questionTranslationStart,
                )}
            ),
            upsert_question_translations AS (
                INSERT INTO "QuestionTranslation" (
                    "id",
                    "questionId",
                    "locale",
                    "text"
                )
                SELECT
                    qti."id",
                    qti."questionId",
                    qti."locale"::"ContentLocale",
                    qti."text"
                FROM question_translation_input qti
                INNER JOIN updated_question uq
                    ON uq."id" = qti."questionId"
                ON CONFLICT ("questionId", "locale")
                DO UPDATE SET "text" = EXCLUDED."text"
                RETURNING "id"
            ),
            option_input("id", "text", "isCorrect", "order") AS (
                VALUES ${buildValuesPlaceholder(
                    optionRows.length,
                    4,
                    optionStart,
                )}
            ),
            updated_options AS (
                UPDATE "AnswerOption" ao
                SET
                    "text" = oi."text",
                    "isCorrect" = oi."isCorrect"::boolean,
                    "order" = oi."order"::int
                FROM option_input oi, updated_question uq
                WHERE
                    ao."id" = oi."id"
                    AND ao."questionId" = uq."id"
                RETURNING ao."id"
            ),
            option_translation_input("id", "optionId", "locale", "text") AS (
                VALUES ${buildValuesPlaceholder(
                    optionTranslationRows.length,
                    4,
                    optionTranslationStart,
                )}
            ),
            upsert_option_translations AS (
                INSERT INTO "AnswerOptionTranslation" (
                    "id",
                    "optionId",
                    "locale",
                    "text"
                )
                SELECT
                    oti."id",
                    oti."optionId",
                    oti."locale"::"ContentLocale",
                    oti."text"
                FROM option_translation_input oti
                INNER JOIN updated_options uo
                    ON uo."id" = oti."optionId"
                ON CONFLICT ("optionId", "locale")
                DO UPDATE SET "text" = EXCLUDED."text"
                RETURNING "id"
            )
            SELECT
                (SELECT COUNT(*)::int FROM updated_question) AS "question_count",
                (SELECT COUNT(*)::int FROM updated_options) AS "option_count",
                (
                    SELECT COUNT(*)::int
                    FROM upsert_question_translations
                ) AS "question_translation_count",
                (
                    SELECT COUNT(*)::int
                    FROM upsert_option_translations
                ) AS "option_translation_count"
        `,
        allParams,
    );

    const summary = result.rows[0];

    if (!summary || summary.question_count === 0) {
        return null;
    }

    if (
        summary.option_count !== input.options.length ||
        summary.question_translation_count !== questionTranslationRows.length ||
        summary.option_translation_count !== optionTranslationRows.length
    ) {
        throw new Error(
            `Incomplete question update for ${input.questionId}: ` +
                `${summary.option_count}/${input.options.length} options, ` +
                `${summary.question_translation_count}/${questionTranslationRows.length} question translations, ` +
                `${summary.option_translation_count}/${optionTranslationRows.length} option translations`,
        );
    }

    return { id: input.questionId };
}

async function updateWithOptionsWithDirectPg(
    input: UpdateQuestionInput,
): Promise<{ id: string } | null> {
    try {
        return await withDirectPgWriteRetry(
            (client) => applyAdminQuestionUpdateWithPg(client, input),
            2,
        );
    } catch (error) {
        const recovered = await recoverAdminUpdateAfterWriteError(
            input,
            error,
        );

        if (recovered) {
            return recovered;
        }

        throw error;
    }
}

// загрузка кандидатов для snapshot сессии по сложности
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
                ORDER BY q."createdAt" ASC, ao."order" ASC
            `,
            [difficulty],
        );
    });

    // группируем вопросы и варианты ответа
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

async function loadRandomSnapshotBundleWithPgClient(
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

async function loadRandomSnapshotBundleWithDirectPg(
    difficulty: Difficulty,
    limit: number,
    locale: Locale,
): Promise<QuestionSnapshotBundleItem[]> {
    return withDirectPgClient((client) =>
        loadRandomSnapshotBundleWithPgClient(
            client,
            difficulty,
            limit,
            locale,
        ),
    );
}

export { loadRandomSnapshotBundleWithPgClient };

// репозиторий для работы с вопросами
export const questionRepository = {
    // случайный выбор активных вопросов для snapshot сессии
    async pickRandomActiveForSnapshot(
        difficulty: Difficulty,
        limit: number,
    ): Promise<QuestionSnapshotCandidate[]> {
        const questions = await loadSnapshotCandidatesByDifficulty(difficulty);

        // перемешиваем вопросы
        const shuffled = shuffleArray(questions);

        // возвращаем случайные вопросы
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

    // один direct pg read: random pick + resolved display text (quiz start hot path)
    pickRandomActiveSnapshotBundle(
        difficulty: Difficulty,
        limit: number,
        locale: Locale,
    ): Promise<QuestionSnapshotBundleItem[]> {
        return loadRandomSnapshotBundleWithDirectPg(difficulty, limit, locale);
    },

    // resolved display text для snapshot сессии (locale + fallback ru + legacy text)
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

    // список вопросов для админ-панели (опциональные фильтры из URL)
    //
    // Serialized fresh Client → pooler + simple SQL (withAdminListPgClient).
    // Не JOIN translations в list SELECT; не client.query(sql, params).
    async findAllForAdmin(
        locale: Locale,
        filters?: AdminQuestionListFilters,
    ) {
        // Locale text: legacy Question.text is the ru cache written on create/edit.
        // Avoid translation JOIN / follow-up scans — they hang in next+Neon pooler.
        void locale;

        const whereParts: string[] = [];

        if (filters?.status === 'active') {
            whereParts.push(`q."isActive" = true`);
        } else if (filters?.status === 'inactive') {
            whereParts.push(`q."isActive" = false`);
        }

        if (filters?.difficulty && filters.difficulty !== 'all') {
            const difficulty = filters.difficulty;
            if (
                difficulty !== 'EASY' &&
                difficulty !== 'MEDIUM' &&
                difficulty !== 'HARD'
            ) {
                throw new Error(`Invalid difficulty filter: ${difficulty}`);
            }
            whereParts.push(`q."difficulty" = '${difficulty}'::"Difficulty"`);
        }

        if (filters?.type && filters.type !== 'all') {
            const type = filters.type;
            if (type !== 'TEXT' && type !== 'IMAGE_GUESS') {
                throw new Error(`Invalid type filter: ${type}`);
            }
            whereParts.push(`q."type" = '${type}'::"QuestionType"`);
        }

        // Literal substring (position), не ILIKE. Escape ' for simple-query SQL.
        if (filters?.q && filters.q.length > 0) {
            const qLiteral = filters.q.replaceAll("'", "''");
            whereParts.push(`(
                position(lower('${qLiteral}') in lower(q."text")) > 0
                OR EXISTS (
                    SELECT 1
                    FROM "QuestionTranslation" qt_search
                    WHERE qt_search."questionId" = q."id"
                      AND position(lower('${qLiteral}') in lower(qt_search."text")) > 0
                )
            )`);
        }

        // Всегда WHERE: пустой SELECT без WHERE в next+Neon после filter
        // клинил Сброс (~24s timeout), а тот же SELECT с узким WHERE — ок.
        const whereSql =
            whereParts.length > 0
                ? `WHERE ${whereParts.join(' AND ')}`
                : 'WHERE true';

        const listRows = await withAdminListPgClient(async (client) => {
            const listResult = await client.query<{
                id: string;
                text: string;
                type: string;
                difficulty: Difficulty;
                category: string;
                isActive: boolean;
                createdAt: Date;
            }>(
                `
                    SELECT
                        q."id",
                        q."text",
                        q."type"::text AS "type",
                        q."difficulty"::text AS "difficulty",
                        q."category",
                        q."isActive",
                        q."createdAt"
                    FROM "Question" q
                    ${whereSql}
                    ORDER BY q."createdAt" DESC
                `,
            );

            return listResult.rows;
        });

        // Thumbs: кэш 60s или отдельный connect (второй query на том же
        // client после list клинит Neon pooler в next dev).
        const imageGuessIds = new Set(
            listRows
                .filter((row) => row.type === 'IMAGE_GUESS')
                .map((row) => row.id),
        );

        const promptByQuestionId = new Map<string, string>();

        if (imageGuessIds.size > 0) {
            const cached = getCachedAdminPrompts();

            if (cached) {
                for (const id of imageGuessIds) {
                    const url = cached.get(id);
                    if (url) {
                        promptByQuestionId.set(id, url);
                    }
                }
            } else {
                // Thumbs: отдельный connect + один simple SELECT.
                // Второй query на том же client после list клинит Neon pooler.
                const fullPromptMap = new Map<string, string>();

                await withAdminListPgClient(async (client) => {
                    const assetResult = await client.query<{
                        questionId: string;
                        url: string;
                    }>(
                        `
                            SELECT qa."questionId", qa."url"
                            FROM "QuestionAsset" qa
                            WHERE qa."role" = 'PROMPT'::"QuestionAssetRole"
                            ORDER BY qa."order" ASC, qa."id" ASC
                        `,
                    );

                    for (const asset of assetResult.rows) {
                        // Первый по ORDER BY = primary PROMPT (как LIMIT 1 раньше).
                        if (fullPromptMap.has(asset.questionId)) {
                            continue;
                        }
                        fullPromptMap.set(asset.questionId, asset.url);
                    }
                });

                setCachedAdminPrompts(fullPromptMap);

                for (const id of imageGuessIds) {
                    const url = fullPromptMap.get(id);
                    if (url) {
                        promptByQuestionId.set(id, url);
                    }
                }
            }
        }

        // optionsCount пока 0: COUNT/ANY после list тоже клинили pooler.
        // Legacy Question.text = ru cache (без translation JOIN).
        return listRows.map((row) => ({
            id: row.id,
            text: row.text,
            type: toQuestionType(row.type),
            promptImageUrl: promptByQuestionId.get(row.id) ?? null,
            difficulty: row.difficulty,
            category: row.category,
            isActive: row.isActive,
            createdAt: row.createdAt,
            _count: {
                options: 0,
            },
        }));
    },

    // один вопрос для страницы редактирования (admin edit flow)
    findByIdForAdmin(id: string): Promise<AdminQuestionForEdit | null> {
        return findByIdForAdminWithDirectPg(id);
    },

    // создание вопроса с вариантами ответа (admin create flow)
    async createWithOptions(input: CreateQuestionInput) {
        const created = await createWithOptionsWithDirectPg(input);
        invalidateAdminPromptCache();
        return created;
    },

    // обновление вопроса и вариантов по id (admin edit flow)
    async updateWithOptions(input: UpdateQuestionInput) {
        const updated = await updateWithOptionsWithDirectPg(input);
        invalidateAdminPromptCache();
        return updated;
    },

    // деактивация вопроса по id (admin deactivate flow)
    async deactivateById(id: string) {
        return withDirectPgWriteRetry(async (client) => {
            const current = await client.query<{ isActive: boolean }>(
                `SELECT "isActive" FROM "Question" WHERE "id" = $1`,
                [id],
            );
            const question = current.rows[0];

            if (!question) {
                return { status: 'not_found' } as const;
            }

            if (!question.isActive) {
                return { status: 'already_in_target_state' } as const;
            }

            await client.query(
                `UPDATE "Question" SET "isActive" = false WHERE "id" = $1`,
                [id],
            );

            return { status: 'updated' } as const;
        });
    },

    // активация вопроса по id (admin activate flow)
    async activateById(id: string) {
        return withDirectPgWriteRetry(async (client) => {
            const current = await client.query<{ isActive: boolean }>(
                `SELECT "isActive" FROM "Question" WHERE "id" = $1`,
                [id],
            );
            const question = current.rows[0];

            if (!question) {
                return { status: 'not_found' } as const;
            }

            if (question.isActive) {
                return { status: 'already_in_target_state' } as const;
            }

            await client.query(
                `UPDATE "Question" SET "isActive" = true WHERE "id" = $1`,
                [id],
            );

            return { status: 'updated' } as const;
        });
    },

    // удаление вопроса по id (admin delete flow)
    async deleteById(id: string) {
        const deleted = await withDirectPgWriteRetry(async (client) => {
            const result = await client.query<{ id: string }>(
                `DELETE FROM "Question" WHERE "id" = $1 RETURNING "id"`,
                [id],
            );
            const row = result.rows[0];

            if (!row) {
                throw new Error(`Question not found: ${id}`);
            }

            return row;
        });

        invalidateAdminPromptCache();
        return deleted;
    },
};
