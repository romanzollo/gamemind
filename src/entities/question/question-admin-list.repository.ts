/**
 * Список вопросов админки: одна страница + totalCount + картинка и верный
 * ответ IMAGE_GUESS — один запрос за одно соединение. Здесь же dev-only
 * очередь/пауза соединений и TTL-кэш страницы (см. комментарий ниже),
 * инвалидация/патч этого кэша для модулей записи и статусов.
 * Вызывается через фасад question-admin.repository.ts.
 */


import type { Client } from 'pg';
import { type Locale } from '@/shared/i18n';
import { ADMIN_QUESTION_LIST_PAGE_SIZE } from '@/features/admin/lib/constants';
import type { AdminQuestionListFilters } from '@/features/admin/lib/parse-admin-question-list-filters';
import {
    ADMIN_TAG_ID_PATTERN,
    getAdminQuestionListPageMeta,
} from '@/features/admin/lib/parse-admin-question-list-filters';


import type { Difficulty, QuestionPublicationStatus, QuestionType } from '@/types';
import { withDirectPgClient } from '@/lib/db/direct-pg';


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
export function patchAdminListCacheQuestion(
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

export function toQuestionType(value: string): QuestionType {
    return value === 'IMAGE_GUESS' ? 'IMAGE_GUESS' : 'TEXT';
}

export function toPublicationStatus(value: string): QuestionPublicationStatus {
    if (value === 'IN_REVIEW' || value === 'PUBLISHED' || value === 'DRAFT') {
        return value;
    }

    throw new Error(`Invalid publicationStatus from DB: ${value}`);
}

/**
 * Список вопросов для админ-панели: одна страница + totalCount + ссылка
 * на картинку IMAGE_GUESS — один simple-query SQL (withAdminListPgClient).
 * Пагинация обязательна: unbounded SELECT клинит Neon и раздувает RSC.
 */
export async function findAdminQuestionListPage(
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
}
