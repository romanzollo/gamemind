/**
 * Запись вопросов админки: чтение для редактора, создание, правка (bulk
 * CTE на direct pg с восстановлением после обрыва), удаление.
 * Вызывается через фасад question-admin.repository.ts.
 */

import { randomUUID } from 'node:crypto';

import type { ContentLocale } from '@prisma/client';
import type { Client } from 'pg';


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
import type {
    AdminQuestionForEdit,
    AdminQuestionUpdateResult,
    LocalizedAdminText,
} from '@/entities/question/question.types';

import {
    invalidateAdminListCaches,
    toPublicationStatus,
} from '@/entities/question/question-admin-list.repository';

type TranslationRow = {
    locale: ContentLocale;
    text: string;
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

type AdminQuestionDetailRow = {
    id: string;
    text: string;
    type: QuestionType;
    promptImageUrl: string | null;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    publicationStatus: string;
    translations: TranslationRow[];
    options: Array<{
        id: string;
        text: string;
        isCorrect: boolean;
        order: number;
        translations: TranslationRow[];
    }>;
};

/**
 * Вопрос для edit-страницы и recovery после write-ошибки — ОДНИМ запросом.
 *
 * Почему не 4 SELECT подряд: каждый round-trip Vercel → Neon (а в dev на
 * Windows — секунды на hop) складывался в время открытия edit-страницы.
 * Переводы и варианты собираются json_agg прямо в Postgres; `pg` отдаёт их
 * уже как JS-объекты. Порядок вариантов = `order`, tie-break по id.
 */
export async function findByIdForAdminWithDirectPg(
    id: string,
): Promise<AdminQuestionForEdit | null> {
    const result = await withDirectPgClient((client) =>
        client.query<AdminQuestionDetailRow>(
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
                    q."isActive",
                    q."publicationStatus"::text AS "publicationStatus",
                    COALESCE(
                        (
                            SELECT json_agg(
                                json_build_object(
                                    'locale', qt."locale"::text,
                                    'text', qt."text"
                                )
                            )
                            FROM "QuestionTranslation" qt
                            WHERE qt."questionId" = q."id"
                        ),
                        '[]'::json
                    ) AS "translations",
                    COALESCE(
                        (
                            SELECT json_agg(
                                json_build_object(
                                    'id', ao."id",
                                    'text', ao."text",
                                    'isCorrect', ao."isCorrect",
                                    'order', ao."order",
                                    'translations', COALESCE(
                                        (
                                            SELECT json_agg(
                                                json_build_object(
                                                    'locale', aot."locale"::text,
                                                    'text', aot."text"
                                                )
                                            )
                                            FROM "AnswerOptionTranslation" aot
                                            WHERE aot."optionId" = ao."id"
                                        ),
                                        '[]'::json
                                    )
                                )
                                ORDER BY ao."order" ASC, ao."id" ASC
                            )
                            FROM "AnswerOption" ao
                            WHERE ao."questionId" = q."id"
                        ),
                        '[]'::json
                    ) AS "options"
                FROM "Question" q
                WHERE q."id" = $1
            `,
            [id],
        ),
    );

    const row = result.rows[0];

    if (!row) {
        return null;
    }

    return {
        id: row.id,
        type: row.type,
        promptImageUrl: row.promptImageUrl,
        difficulty: row.difficulty,
        category: row.category,
        isActive: row.isActive,
        publicationStatus: toPublicationStatus(row.publicationStatus),
        translations: buildAdminTranslations(row.translations, row.text),
        options: row.options.map((option) => ({
            id: option.id,
            isCorrect: option.isCorrect,
            order: option.order,
            translations: buildAdminTranslations(
                option.translations,
                option.text,
            ),
        })),
    };
}

async function recoverAdminUpdateAfterWriteError(
    input: UpdateQuestionInput,
    error: unknown,
): Promise<AdminQuestionUpdateResult | null> {
    if (!isTransientDirectPgError(error)) {
        return null;
    }

    const current = await findByIdForAdminWithDirectPg(input.questionId).catch(
        () => null,
    );

    if (!current || !adminQuestionMatchesUpdateInput(current, input)) {
        return null;
    }

    // Запись уже прошла, прежний url не восстановить → не удаляем (orphan безопаснее).
    return { id: input.questionId, previousPromptImageUrl: null };
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
                    "publicationStatus",
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
                    'DRAFT'::"QuestionPublicationStatus",
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
): Promise<AdminQuestionUpdateResult | null> {
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
        previous_prompt_url: string | null;
    }>(
        `
            WITH previous_prompt AS (
                -- Все CTE одного statement видят снимок ДО изменений:
                -- это url, который UPDATE ниже заменит или удалит.
                SELECT qa."url"
                FROM "QuestionAsset" qa
                WHERE
                    qa."questionId" = $5
                    AND qa."role" = 'PROMPT'::"QuestionAssetRole"
                ORDER BY qa."order" ASC, qa."id" ASC
                LIMIT 1
            ),
            updated_question AS (
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
                ) AS "option_translation_count",
                (SELECT "url" FROM previous_prompt) AS "previous_prompt_url"
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

    return {
        id: input.questionId,
        previousPromptImageUrl: summary.previous_prompt_url,
    };
}

async function updateWithOptionsWithDirectPg(
    input: UpdateQuestionInput,
): Promise<AdminQuestionUpdateResult | null> {
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

/** Создание вопроса с вариантами (admin create flow). */
export async function createAdminQuestion(input: CreateQuestionInput) {
    const created = await createWithOptionsWithDirectPg(input);
    invalidateAdminListCaches();
    return created;
}

/** Обновление вопроса и вариантов по id (admin edit flow). */
export async function updateAdminQuestion(input: UpdateQuestionInput) {
    const updated = await updateWithOptionsWithDirectPg(input);
    invalidateAdminListCaches();
    return updated;
}

// удаление вопроса по id (admin delete flow)
export async function deleteAdminQuestionById(id: string) {
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

    invalidateAdminListCaches();
    return deleted;
}
