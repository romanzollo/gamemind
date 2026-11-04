/**
 * Admin question list / CRUD (Neon-hardened path).
 *
 * Зачем отдельный модуль (§11.7): admin list queue, list cache и bulk CTE
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
import { ADMIN_QUESTION_LIST_PAGE_SIZE } from '@/features/admin/lib/constants';
import type { AdminQuestionListFilters } from '@/features/admin/lib/parse-admin-question-list-filters';
import {
    ADMIN_TAG_ID_PATTERN,
    getAdminQuestionListPageMeta,
} from '@/features/admin/lib/parse-admin-question-list-filters';
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
    AdminQuestionUpdateResult,
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
 * Admin list read: fresh Client → Neon unpooled (withDirectPgClient:
 * wall-clock timeout → socket.destroy, затем retry).
 *
 * Список — один запрос за одно соединение: страница, общее число
 * (COUNT(*) OVER) и ссылка на картинку-подсказку. Сам SQL на Neon занимает
 * доли миллисекунды; время страницы — это число соединений (ADR «Admin list:
 * one query, dev-only lab guards»).
 *
 * Только для `next dev` на Windows (TLS-лаборатория, docs/QUIZ_NEON_HOT_PATH.md):
 * - очередь «один list за раз» + пауза ~300ms после connect: параллельный или
 *   back-to-back TLS к Neon там клинит следующий soft-nav / «Сброс»;
 * - TTL-кэш страницы списка: connect в dev ~2s, повторный GET без TLS.
 * На проде (fra1 ↔ Neon Frankfurt, connect ~десятки ms) обе меры только
 * добавляли задержку, а кэш в памяти одного инстанса мог показать устаревшую
 * строку после правки, ушедшей на другой инстанс.
 */
const isDevelopment = process.env.NODE_ENV === 'development';
/** Строка результата findAllForAdmin (для TTL-кэша списка). */
type AdminListResultRow = {
    id: string;
    text: string;
    type: QuestionType;
    promptImageUrl: string | null;
    /** Текст верного варианта на языке страницы; только для IMAGE_GUESS. */
    correctAnswer: string | null;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    publicationStatus: QuestionPublicationStatus;
    createdAt: Date;
    _count: { options: number };
};

/** Пагинированный ответ admin list (rows = одна страница). */
export type AdminQuestionListPageResult = {
    rows: AdminListResultRow[];
    totalCount: number;
    page: number;
    pageSize: number;
};

const globalForAdminListPg = globalThis as unknown as {
    adminListTail?: Promise<unknown>;
    adminListResultCache?: {
        at: number;
        key: string;
        rows: AdminListResultRow[];
        totalCount: number;
        page: number;
        pageSize: number;
    };
    /**
     * Поколение кэша списка: invalidate++.
     * In-flight findAll, завершившийся после мутации, не должен
     * снова записать stale DRAFT поверх свежих данных.
     */
    adminListCacheGeneration?: number;
};

/** Кэш списка (только dev): после мутаций сбрасываем; TTL страхует stale. */
const ADMIN_LIST_RESULT_CACHE_TTL_MS = 60_000;

function getAdminListCacheGeneration(): number {
    return globalForAdminListPg.adminListCacheGeneration ?? 0;
}

/**
 * Ключ кэша списка: locale + фильтры + page.
 * pageSize фиксирован — в ключ не кладём.
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
        tag: filters?.tag ?? 'all',
        q: filters?.q ?? '',
        page: filters?.page ?? 1,
    });
}

function getCachedAdminListResult(
    key: string,
): AdminQuestionListPageResult | null {
    if (!isDevelopment) {
        return null;
    }
    const cache = globalForAdminListPg.adminListResultCache;
    if (!cache || cache.key !== key) {
        return null;
    }
    if (Date.now() - cache.at > ADMIN_LIST_RESULT_CACHE_TTL_MS) {
        return null;
    }
    return {
        rows: cache.rows,
        totalCount: cache.totalCount,
        page: cache.page,
        pageSize: cache.pageSize,
    };
}

function setCachedAdminListResult(
    key: string,
    result: AdminQuestionListPageResult,
    generationAtStart: number,
) {
    if (!isDevelopment) {
        return;
    }
    // Мутация во время медленного list SELECT — не травим TTL stale rows.
    if (generationAtStart !== getAdminListCacheGeneration()) {
        return;
    }

    globalForAdminListPg.adminListResultCache = {
        at: Date.now(),
        key,
        rows: result.rows,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
    };
}

/**
 * Сброс list cache после create/update/delete (состав списка меняется).
 * Экспорт — для правки меток (question-tags.repository): фильтр по метке.
 */
export function invalidateAdminListCaches() {
    globalForAdminListPg.adminListCacheGeneration =
        getAdminListCacheGeneration() + 1;
    globalForAdminListPg.adminListResultCache = undefined;
}

/**
 * Точечное обновление одной строки в TTL list-cache (dev) после status-мутации.
 *
 * Зачем: полный invalidate → после redirect снова connect к Neon (~2s в dev).
 * Для publication/isActive достаточно поправить row in-memory: DB уже обновлена,
 * картинка не меняется. Это cache coherence, не «фальшивый UI».
 * На проде кэша нет — функция ничего не делает.
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
        totalCount: cache.totalCount,
        page: cache.page,
        pageSize: cache.pageSize,
    };
}

async function withAdminListPgClient<T>(
    operation: (client: Client) => Promise<T>,
): Promise<T> {
    // Прод: без очереди и паузы — это защита от TLS-клина Windows `next dev`.
    if (!isDevelopment) {
        return withDirectPgClient(operation);
    }

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
        console.info(`[admin-list-pg] ok ${Date.now() - started}ms`);
        return value;
    } catch (error) {
        console.warn(
            `[admin-list-pg] fail ${Date.now() - started}ms:`,
            error instanceof Error ? error.message : error,
        );
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
async function findByIdForAdminWithDirectPg(
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
    /**
     * Список вопросов для админ-панели: одна страница + totalCount + ссылка
     * на картинку IMAGE_GUESS — один simple-query SQL (withAdminListPgClient).
     * Пагинация обязательна: unbounded SELECT клинит Neon и раздувает RSC.
     */
    async findAllForAdmin(
        locale: Locale,
        filters?: AdminQuestionListFilters,
    ): Promise<AdminQuestionListPageResult> {
        const pageSize = ADMIN_QUESTION_LIST_PAGE_SIZE;
        const requestedPage = filters?.page ?? 1;

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

        // Метка: id только по ADMIN_TAG_ID_PATTERN ([a-z0-9.-]) — безопасен
        // литералом. Семейство (PlayStation) охватывает детей через parentId.
        if (filters?.tag === 'untagged') {
            whereParts.push(`NOT EXISTS (
                SELECT 1 FROM "QuestionTag" qtag
                WHERE qtag."questionId" = q."id"
            )`);
        } else if (filters?.tag && filters.tag !== 'all') {
            if (!ADMIN_TAG_ID_PATTERN.test(filters.tag)) {
                throw new Error(`Invalid tag filter: ${filters.tag}`);
            }
            whereParts.push(`EXISTS (
                SELECT 1
                FROM "QuestionTag" qtag
                JOIN "Tag" tag ON tag."id" = qtag."tagId"
                WHERE qtag."questionId" = q."id"
                  AND (tag."id" = '${filters.tag}' OR tag."parentId" = '${filters.tag}')
            )`);
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

        // Страница, общее число и картинка — одним запросом за одно соединение
        // (ADR «Admin list: one query, dev-only lab guards»). COUNT(*) OVER()
        // считается по всей отфильтрованной выборке до LIMIT. Подзапросы текста
        // EN и картинки — во внешнем SELECT, по 25 строкам страницы, а не по
        // всей выборке. Simple query без $n: значения фильтров выше — allowlist.
        // `id` — второй ключ сортировки: при равном createdAt (вставка в одной
        // транзакции) порядок без него не определён и OFFSET-страницы могут
        // повторить или пропустить строку.
        type AdminListRow = {
            id: string;
            text: string;
            type: string;
            difficulty: Difficulty;
            category: string;
            isActive: boolean;
            publicationStatus: string;
            createdAt: Date;
            promptImageUrl: string | null;
            correctAnswer: string | null;
            totalCount: number | string;
        };

        const listTextSql =
            locale === 'en'
                ? `COALESCE(
                    (
                        SELECT qt_en."text"
                        FROM "QuestionTranslation" qt_en
                        WHERE qt_en."questionId" = page."id"
                          AND qt_en."locale" = 'en'::"ContentLocale"
                        LIMIT 1
                    ),
                    page."text"
                )`
                : `page."text"`;

        // Верный вариант — только у IMAGE_GUESS: у них одинаковый текст
        // («Угадай игру…»), и строки иначе не различить без картинки.
        // EN — перевод варианта, иначе базовый текст (как у текста вопроса).
        const correctAnswerTextSql =
            locale === 'en'
                ? `COALESCE(
                    (
                        SELECT aot."text"
                        FROM "AnswerOptionTranslation" aot
                        WHERE aot."optionId" = ao."id"
                          AND aot."locale" = 'en'::"ContentLocale"
                        LIMIT 1
                    ),
                    ao."text"
                )`
                : `ao."text"`;

        const cacheKey = buildAdminListCacheKey(locale, filters);
        const cachedList = getCachedAdminListResult(cacheKey);
        if (cachedList) {
            if (isDevelopment) {
                console.info(
                    `[admin/questions] findAllForAdmin cache hit (rows=${cachedList.rows.length}, total=${cachedList.totalCount}, page=${cachedList.page})`,
                );
            }
            return cachedList;
        }

        const generationAtStart = getAdminListCacheGeneration();

        function parseCount(value: number | string | undefined): number {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value;
            }
            if (typeof value === 'string') {
                const parsed = Number.parseInt(value, 10);
                return Number.isFinite(parsed) ? parsed : 0;
            }
            return 0;
        }

        const whereSql =
            whereParts.length > 0
                ? `WHERE ${whereParts.join(' AND ')}`
                : '';
        const offset = (Math.max(1, requestedPage) - 1) * pageSize;

        const listRows = await withAdminListPgClient(async (client) => {
            const listResult = await client.query<AdminListRow>(`
                WITH page AS (
                    SELECT
                        q."id",
                        q."text",
                        q."type",
                        q."difficulty",
                        q."category",
                        q."isActive",
                        q."publicationStatus",
                        q."createdAt",
                        COUNT(*) OVER () AS "totalCount"
                    FROM "Question" q
                    ${whereSql}
                    ORDER BY q."createdAt" DESC, q."id" DESC
                    LIMIT ${pageSize} OFFSET ${offset}
                )
                SELECT
                    page."id",
                    ${listTextSql} AS "text",
                    page."type"::text AS "type",
                    page."difficulty"::text AS "difficulty",
                    page."category",
                    page."isActive",
                    page."publicationStatus"::text AS "publicationStatus",
                    page."createdAt",
                    CASE
                        WHEN page."type" = 'IMAGE_GUESS'::"QuestionType" THEN (
                            SELECT qa."url"
                            FROM "QuestionAsset" qa
                            WHERE qa."questionId" = page."id"
                              AND qa."role" = 'PROMPT'::"QuestionAssetRole"
                            ORDER BY qa."order" ASC, qa."id" ASC
                            LIMIT 1
                        )
                    END AS "promptImageUrl",
                    CASE
                        WHEN page."type" = 'IMAGE_GUESS'::"QuestionType" THEN (
                            SELECT ${correctAnswerTextSql}
                            FROM "AnswerOption" ao
                            WHERE ao."questionId" = page."id"
                              AND ao."isCorrect" = true
                            ORDER BY ao."order" ASC, ao."id" ASC
                            LIMIT 1
                        )
                    END AS "correctAnswer",
                    page."totalCount"::int AS "totalCount"
                FROM page
                ORDER BY page."createdAt" DESC, page."id" DESC
            `);
            return listResult.rows;
        });

        let totalCount = parseCount(listRows[0]?.totalCount);

        // Пустая страница при page > 1: ссылка устарела (вопросы удалили) —
        // OVER() без строк не знает общего числа. Редкий путь: отдельный
        // COUNT, page.tsx уведёт на последнюю существующую страницу.
        if (listRows.length === 0 && requestedPage > 1) {
            totalCount = await withAdminListPgClient(async (client) => {
                const countResult = await client.query<{ c: number | string }>(
                    `SELECT COUNT(*)::int AS c FROM "Question" q ${whereSql}`,
                );
                return parseCount(countResult.rows[0]?.c);
            });
        }

        const pageMeta = getAdminQuestionListPageMeta(
            totalCount,
            requestedPage,
            pageSize,
        );

        // optionsCount не читаем: список его не показывает.
        const rows: AdminListResultRow[] = listRows.map((row) => ({
            id: row.id,
            text: row.text,
            type: toQuestionType(row.type),
            promptImageUrl: row.promptImageUrl,
            correctAnswer: row.correctAnswer,
            difficulty: row.difficulty,
            category: row.category,
            isActive: row.isActive,
            publicationStatus: toPublicationStatus(row.publicationStatus),
            createdAt: row.createdAt,
            _count: {
                options: 0,
            },
        }));

        const result: AdminQuestionListPageResult = {
            rows,
            totalCount: pageMeta.totalCount,
            page: pageMeta.page,
            pageSize: pageMeta.pageSize,
        };

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
