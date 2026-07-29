/**
 * Admin question list / CRUD (Neon-hardened path).
 *
 * Зачем отдельный модуль (§11.7): admin list queue, thumbs cache и bulk CTE
 * create/edit не должны смешиваться с quiz-pick hot path.
 *
 * publicationStatus — жизненный цикл контента (DRAFT / IN_REVIEW / PUBLISHED);
 * isActive — soft-hide. Create пишет DRAFT; edit content не меняет status;
 * переходы — отдельные idempotent методы. Quiz snapshot/scoring не трогаем.
 *
 * Публичный фасад: question.repository.ts реэкспортирует warmAdminListConnection
 * и склеивает методы в questionRepository.
 * См. docs/DECISIONS.md → Repository File Split + Admin List Neon Hang Mitigation.
 */

import { randomUUID } from 'node:crypto';

import type { ContentLocale } from '@prisma/client';
import type { Client } from 'pg';
import { type Locale } from '@/shared/i18n';
import type { AdminQuestionListFilters } from '@/features/admin/lib/parse-admin-question-list-filters';
import { normalizeBulkQuestionIds } from '@/features/admin/lib/parse-bulk-question-ids';
import type {
    CreateQuestionInput,
    UpdateQuestionInput,
} from '@/features/admin/lib/validation';
import type { Difficulty, QuestionPublicationStatus, QuestionType } from '@/types';
import {
    isTransientDirectPgError,
    withDirectPgClient,
    withDirectPgWriteRetry,
} from '@/lib/db/direct-pg';
import type {
    AdminQuestionForEdit,
    BulkIsActiveMutationResult,
    BulkPublicationMutationResult,
    LocalizedAdminText,
    PublicationStatusMutationResult,
} from '@/entities/question/question.types';

/**
 * Разрешённые переходы publicationStatus.
 * DRAFT → PUBLISHED напрямую: solo-admin может пропустить ревью.
 * PUBLISHED → только обратно в DRAFT (снять с pool).
 */
const PUBLICATION_TRANSITIONS: Record<
    QuestionPublicationStatus,
    readonly QuestionPublicationStatus[]
> = {
    DRAFT: ['IN_REVIEW', 'PUBLISHED'],
    IN_REVIEW: ['PUBLISHED', 'DRAFT'],
    PUBLISHED: ['DRAFT'],
};

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
 * + ping с admin hub) и TTL-кэш PROMPT urls + list rows (повторный GET
 * без лишнего TLS). Unfiltered list = 3 последовательных SELECT по
 * difficulty (UNION ALL / full scan в next+Neon клинят ~24s).
 * После каждого connect очередь держит ~300ms — hard-nav Сброс не стартует
 * TLS, пока предыдущий end() ещё клинит Windows+Neon.
 */
/** Строка результата findAllForAdmin (для TTL-кэша списка). */
type AdminListResultRow = {
    id: string;
    text: string;
    type: QuestionType;
    promptImageUrl: string | null;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    publicationStatus: QuestionPublicationStatus;
    createdAt: Date;
    _count: { options: number };
};

const globalForAdminListPg = globalThis as unknown as {
    adminListTail?: Promise<unknown>;
    adminPromptCache?: {
        at: number;
        map: Map<string, string>;
    };
    adminListResultCache?: {
        at: number;
        key: string;
        rows: AdminListResultRow[];
    };
    /**
     * Поколение кэша списка: invalidate++.
     * In-flight findAll, завершившийся после мутации, не должен
     * снова записать stale DRAFT поверх свежих данных.
     */
    adminListCacheGeneration?: number;
};

/** Кэш thumbs / list: после мутаций сбрасываем; TTL страхует stale. */
const ADMIN_PROMPT_CACHE_TTL_MS = 60_000;
const ADMIN_LIST_RESULT_CACHE_TTL_MS = 60_000;

function getAdminListCacheGeneration(): number {
    return globalForAdminListPg.adminListCacheGeneration ?? 0;
}

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

/**
 * Ключ кэша списка включает locale: текст выбирается в основном SELECT.
 */
function buildAdminListCacheKey(
    locale: Locale,
    filters?: AdminQuestionListFilters,
): string {
    return JSON.stringify({
        locale,
        status: filters?.status ?? 'all',
        publication: filters?.publication ?? 'all',
        difficulty: filters?.difficulty ?? 'all',
        type: filters?.type ?? 'all',
        q: filters?.q ?? '',
    });
}

function getCachedAdminListResult(
    key: string,
): AdminListResultRow[] | null {
    const cache = globalForAdminListPg.adminListResultCache;
    if (!cache || cache.key !== key) {
        return null;
    }
    if (Date.now() - cache.at > ADMIN_LIST_RESULT_CACHE_TTL_MS) {
        return null;
    }
    return cache.rows;
}

function setCachedAdminListResult(
    key: string,
    rows: AdminListResultRow[],
    generationAtStart: number,
) {
    // Мутация во время медленного list SELECT — не травим TTL stale rows.
    if (generationAtStart !== getAdminListCacheGeneration()) {
        return;
    }

    globalForAdminListPg.adminListResultCache = {
        at: Date.now(),
        key,
        rows,
    };
}

/** Сброс thumbs + list cache после create/update/delete (состав списка меняется). */
function invalidateAdminListCaches() {
    globalForAdminListPg.adminListCacheGeneration =
        getAdminListCacheGeneration() + 1;
    globalForAdminListPg.adminPromptCache = undefined;
    globalForAdminListPg.adminListResultCache = undefined;
}

/**
 * Точечное обновление одной строки в TTL list-cache после status-мутации.
 *
 * Зачем: полный invalidate → после redirect снова 3×SELECT + settle (~2–4s).
 * Для publication/isActive достаточно поправить row in-memory: DB уже обновлена,
 * prompt thumbs не меняются. Это cache coherence, не «фальшивый UI».
 *
 * Когда всё же invalidate: активный URL-фильтр по status/publication — строка
 * может выпасть из выборки; безопаснее перечитать.
 */
function patchAdminListCacheQuestion(
    id: string,
    patch: {
        publicationStatus?: QuestionPublicationStatus;
        isActive?: boolean;
    },
): void {
    const cache = globalForAdminListPg.adminListResultCache;
    if (!cache) {
        return;
    }

    let filterKey: {
        status?: string;
        publication?: string;
    };
    try {
        filterKey = JSON.parse(cache.key) as {
            status?: string;
            publication?: string;
        };
    } catch {
        invalidateAdminListCaches();
        return;
    }

    const statusFilter = filterKey.status ?? 'all';
    const publicationFilter = filterKey.publication ?? 'all';

    if (
        patch.publicationStatus !== undefined &&
        publicationFilter !== 'all'
    ) {
        invalidateAdminListCaches();
        return;
    }

    if (patch.isActive !== undefined && statusFilter !== 'all') {
        invalidateAdminListCaches();
        return;
    }

    const index = cache.rows.findIndex((row) => row.id === id);
    if (index === -1) {
        return;
    }

    const nextRows = cache.rows.slice();
    nextRows[index] = {
        ...nextRows[index],
        ...patch,
    };

    globalForAdminListPg.adminListResultCache = {
        at: Date.now(),
        key: cache.key,
        rows: nextRows,
    };
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

function toPublicationStatus(value: string): QuestionPublicationStatus {
    if (value === 'IN_REVIEW' || value === 'PUBLISHED' || value === 'DRAFT') {
        return value;
    }

    throw new Error(`Invalid publicationStatus from DB: ${value}`);
}

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
            publicationStatus: string;
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
                    q."isActive",
                    q."publicationStatus"::text AS "publicationStatus"
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
            publicationStatus: toPublicationStatus(row.publicationStatus),
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

/**
 * Смена publicationStatus с проверкой переходов.
 * Не через Prisma: тот же direct pg write path, что deactivate/activate.
 */
async function setPublicationStatusByIdWithDirectPg(
    id: string,
    target: QuestionPublicationStatus,
): Promise<PublicationStatusMutationResult> {
    return withDirectPgWriteRetry(async (client) => {
        const current = await client.query<{
            publicationStatus: string;
        }>(
            `SELECT "publicationStatus"::text AS "publicationStatus"
             FROM "Question" WHERE "id" = $1`,
            [id],
        );
        const question = current.rows[0];

        if (!question) {
            return { status: 'not_found' };
        }

        const from = toPublicationStatus(question.publicationStatus);

        if (from === target) {
            return { status: 'already_in_target_state' };
        }

        if (!PUBLICATION_TRANSITIONS[from].includes(target)) {
            return { status: 'invalid_transition', from, to: target };
        }

        await client.query(
            `UPDATE "Question"
             SET "publicationStatus" = $2::"QuestionPublicationStatus",
                 "updatedAt" = NOW()
             WHERE "id" = $1`,
            [id, target],
        );

        return { status: 'updated' };
    });
}

async function mutatePublicationStatusById(
    id: string,
    target: QuestionPublicationStatus,
): Promise<PublicationStatusMutationResult> {
    const result = await setPublicationStatusByIdWithDirectPg(id, target);

    if (
        result.status === 'updated' ||
        result.status === 'already_in_target_state'
    ) {
        // Не полный invalidate: redirect на list должен попасть в cache hit.
        patchAdminListCacheQuestion(id, { publicationStatus: target });
    }

    return result;
}

/**
 * Один UPDATE для многих id: только строки, где isActive ещё не target.
 * Autocommit (без BEGIN/COMMIT) — см. Neon write path в DECISIONS.md.
 * После успеха — полный invalidate list-cache (много строк + фильтр status).
 * Нормализация id — shared pure lib (parse-bulk-question-ids).
 */
async function setManyIsActiveByIds(
    ids: readonly string[],
    isActive: boolean,
): Promise<BulkIsActiveMutationResult> {
    const normalized = normalizeBulkQuestionIds(ids);

    if (normalized.length === 0) {
        return { requestedCount: 0, updatedCount: 0 };
    }

    const result = await withDirectPgWriteRetry(async (client) => {
        // cuid id → text[]; AND isActive <> target = idempotent no-op для уже готовых.
        const updated = await client.query<{ id: string }>(
            `UPDATE "Question"
             SET "isActive" = $1
             WHERE "id" = ANY($2::text[])
               AND "isActive" = $3
             RETURNING "id"`,
            [isActive, normalized, !isActive],
        );

        return {
            requestedCount: normalized.length,
            updatedCount: updated.rowCount ?? updated.rows.length,
        } satisfies BulkIsActiveMutationResult;
    });

    if (result.updatedCount > 0) {
        invalidateAdminListCaches();
    }

    return result;
}

/**
 * Bulk-смена publicationStatus: один UPDATE, без цикла Prisma/$transaction.
 *
 * fromStatuses — allowlist «откуда можно» (как PUBLICATION_TRANSITIONS).
 * Уже target / другой статус / нет строки → не входят в updatedCount.
 * Autocommit; полный invalidate list-cache при updatedCount > 0
 * (как bulk isActive: фильтр publication на list может скрыть строки).
 * Quality gate сюда не кладём — только SQL-переход.
 */
async function setManyPublicationStatusByIds(
    ids: readonly string[],
    target: QuestionPublicationStatus,
    fromStatuses: readonly QuestionPublicationStatus[],
): Promise<BulkPublicationMutationResult> {
    const normalized = normalizeBulkQuestionIds(ids);

    if (normalized.length === 0 || fromStatuses.length === 0) {
        return { requestedCount: normalized.length, updatedCount: 0 };
    }

    // Inline enum literals (не $n для enum[]) — тот же стиль, что admin list WHERE.
    const fromSql = fromStatuses
        .map((status) => `'${status}'::"QuestionPublicationStatus"`)
        .join(', ');

    const result = await withDirectPgWriteRetry(async (client) => {
        const updated = await client.query<{ id: string }>(
            `UPDATE "Question"
             SET "publicationStatus" = '${target}'::"QuestionPublicationStatus"
             WHERE "id" = ANY($1::text[])
               AND "publicationStatus" IN (${fromSql})
             RETURNING "id"`,
            [normalized],
        );

        return {
            requestedCount: normalized.length,
            updatedCount: updated.rowCount ?? updated.rows.length,
        } satisfies BulkPublicationMutationResult;
    });

    if (result.updatedCount > 0) {
        invalidateAdminListCaches();
    }

    return result;
}

/** Методы admin для фасада questionRepository (без смены сигнатур). */
export const questionAdminMethods = {
    // список вопросов для админ-панели (опциональные фильтры из URL)
    //
    // Serialized fresh Client → pooler + simple SQL (withAdminListPgClient).
    // Не JOIN translations в list SELECT; не client.query(sql, params).
    async findAllForAdmin(
        locale: Locale,
        filters?: AdminQuestionListFilters,
    ) {
        // List SELECT без JOIN (hang class). Для EN используем scalar subquery
        // по уникальному questionId+locale; это один основной read, без второго
        // connect и без блокировки фильтров.

        const whereParts: string[] = [];

        if (filters?.status === 'active') {
            whereParts.push(`q."isActive" = true`);
        } else if (filters?.status === 'inactive') {
            whereParts.push(`q."isActive" = false`);
        }

        // publicationStatus — allowlist + inline enum (как difficulty/type).
        // Не $1 / ANY: hang playbook admin list.
        if (filters?.publication && filters.publication !== 'all') {
            const publication = filters.publication;
            if (
                publication !== 'DRAFT' &&
                publication !== 'IN_REVIEW' &&
                publication !== 'PUBLISHED'
            ) {
                throw new Error(
                    `Invalid publication filter: ${publication}`,
                );
            }
            whereParts.push(
                `q."publicationStatus" = '${publication}'::"QuestionPublicationStatus"`,
            );
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

        // Без пользовательского фильтра один SELECT / UNION ALL клинит
        // next+Neon (~24s). Узкий WHERE по одному difficulty стабилен.
        // Unfiltered = 3 последовательных SELECT (не parallel TLS).
        // TTL-кэш результата смягчает повторные GET после первого успешного.
        type AdminListRow = {
            id: string;
            text: string;
            type: string;
            difficulty: Difficulty;
            category: string;
            isActive: boolean;
            publicationStatus: string;
            createdAt: Date;
        };

        const listTextSql =
            locale === 'en'
                ? `COALESCE(
                    (
                        SELECT qt_en."text"
                        FROM "QuestionTranslation" qt_en
                        WHERE qt_en."questionId" = q."id"
                          AND qt_en."locale" = 'en'::"ContentLocale"
                        LIMIT 1
                    ),
                    q."text"
                )`
                : `q."text"`;

        const listSelectSql = `
            SELECT
                q."id",
                ${listTextSql} AS "text",
                q."type"::text AS "type",
                q."difficulty"::text AS "difficulty",
                q."category",
                q."isActive",
                q."publicationStatus"::text AS "publicationStatus",
                q."createdAt"
            FROM "Question" q
        `;

        const cacheKey = buildAdminListCacheKey(locale, filters);
        const cachedList = getCachedAdminListResult(cacheKey);
        if (cachedList) {
            if (process.env.NODE_ENV === 'development') {
                console.info(
                    `[admin/questions] findAllForAdmin cache hit (rows=${cachedList.length})`,
                );
            }
            return cachedList;
        }

        const generationAtStart = getAdminListCacheGeneration();

        let listRows: AdminListRow[];

        // Узкий путь только когда есть difficulty (leading column индекса
        // (difficulty, isActive, publicationStatus)). Фильтр только по
        // publication/status/type/q без difficulty ≈ full scan → hang class
        // в next+Neon; тогда режем по трём difficulty и AND остальные WHERE.
        const hasDifficultyFilter = Boolean(
            filters?.difficulty && filters.difficulty !== 'all',
        );

        if (hasDifficultyFilter) {
            const whereSql = `WHERE ${whereParts.join(' AND ')}`;
            listRows = await withAdminListPgClient(async (client) => {
                const listResult = await client.query<AdminListRow>(
                    `
                        ${listSelectSql}
                        ${whereSql}
                        ORDER BY q."createdAt" DESC
                    `,
                );
                return listResult.rows;
            });
        } else {
            // Три узких connect подряд — UNION ALL / full scan снова ~24s.
            const difficulties: Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];
            const merged: AdminListRow[] = [];
            const extraWhere =
                whereParts.length > 0
                    ? ` AND ${whereParts.join(' AND ')}`
                    : '';

            for (const difficulty of difficulties) {
                const chunk = await withAdminListPgClient(async (client) => {
                    const listResult = await client.query<AdminListRow>(
                        `
                            ${listSelectSql}
                            WHERE q."difficulty" = '${difficulty}'::"Difficulty"${extraWhere}
                            ORDER BY q."createdAt" DESC
                        `,
                    );
                    return listResult.rows;
                });
                merged.push(...chunk);
            }

            merged.sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
            );
            listRows = merged;
        }

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
        const result: AdminListResultRow[] = listRows.map((row) => ({
            id: row.id,
            text: row.text,
            type: toQuestionType(row.type),
            promptImageUrl: promptByQuestionId.get(row.id) ?? null,
            difficulty: row.difficulty,
            category: row.category,
            isActive: row.isActive,
            publicationStatus: toPublicationStatus(row.publicationStatus),
            createdAt: row.createdAt,
            _count: {
                options: 0,
            },
        }));

        setCachedAdminListResult(cacheKey, result, generationAtStart);
        return result;
    },

    // один вопрос для страницы редактирования (admin edit flow)
    findByIdForAdmin(id: string): Promise<AdminQuestionForEdit | null> {
        return findByIdForAdminWithDirectPg(id);
    },

    // создание вопроса с вариантами ответа (admin create flow)
    async createWithOptions(input: CreateQuestionInput) {
        const created = await createWithOptionsWithDirectPg(input);
        invalidateAdminListCaches();
        return created;
    },

    // обновление вопроса и вариантов по id (admin edit flow)
    async updateWithOptions(input: UpdateQuestionInput) {
        const updated = await updateWithOptionsWithDirectPg(input);
        invalidateAdminListCaches();
        return updated;
    },

    // деактивация вопроса по id (admin deactivate flow)
    async deactivateById(id: string) {
        const result = await withDirectPgWriteRetry(async (client) => {
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

        if (
            result.status === 'updated' ||
            result.status === 'already_in_target_state'
        ) {
            patchAdminListCacheQuestion(id, { isActive: false });
        }

        return result;
    },

    // активация вопроса по id (admin activate flow)
    async activateById(id: string) {
        const result = await withDirectPgWriteRetry(async (client) => {
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

        if (
            result.status === 'updated' ||
            result.status === 'already_in_target_state'
        ) {
            patchAdminListCacheQuestion(id, { isActive: true });
        }

        return result;
    },

    /**
     * Bulk soft-hide: isActive=false для выбранных id.
     * Один UPDATE (не цикл Prisma/$transaction). Idempotent для уже inactive.
     */
    deactivateManyByIds(ids: readonly string[]) {
        return setManyIsActiveByIds(ids, false);
    },

    /**
     * Bulk restore в витрину: isActive=true для выбранных id.
     * Не меняет publicationStatus — PUBLISHED+active попадает в quiz pool.
     */
    activateManyByIds(ids: readonly string[]) {
        return setManyIsActiveByIds(ids, true);
    },

    /**
     * Bulk DRAFT → IN_REVIEW. Уже IN_REVIEW / PUBLISHED — no-op для этих строк.
     * Quality gate — в Server Action до вызова.
     */
    submitForReviewManyByIds(ids: readonly string[]) {
        return setManyPublicationStatusByIds(ids, 'IN_REVIEW', ['DRAFT']);
    },

    /**
     * Bulk DRAFT | IN_REVIEW → PUBLISHED.
     * PUBLISHED уже — no-op. isActive не трогаем (quiz pool = active+PUBLISHED).
     * Quality gate — в Server Action до вызова.
     */
    publishManyByIds(ids: readonly string[]) {
        return setManyPublicationStatusByIds(ids, 'PUBLISHED', [
            'DRAFT',
            'IN_REVIEW',
        ]);
    },

    /**
     * Смена publicationStatus с проверкой разрешённых переходов.
     * Idempotent: уже target → already_in_target_state (без UPDATE).
     */
    setPublicationStatusById(
        id: string,
        target: QuestionPublicationStatus,
    ): Promise<PublicationStatusMutationResult> {
        return mutatePublicationStatusById(id, target);
    },

    /** DRAFT → IN_REVIEW (отправить на ревью). */
    submitForReviewById(id: string): Promise<PublicationStatusMutationResult> {
        return mutatePublicationStatusById(id, 'IN_REVIEW');
    },

    /** DRAFT | IN_REVIEW → PUBLISHED (в quiz pool, если isActive). */
    publishById(id: string): Promise<PublicationStatusMutationResult> {
        return mutatePublicationStatusById(id, 'PUBLISHED');
    },

    /** IN_REVIEW | PUBLISHED → DRAFT (отклонить / снять с публикации). */
    returnToDraftById(id: string): Promise<PublicationStatusMutationResult> {
        return mutatePublicationStatusById(id, 'DRAFT');
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

        invalidateAdminListCaches();
        return deleted;
    },
};
