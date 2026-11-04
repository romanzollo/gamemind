import { z } from 'zod';

/**
 * Парсинг search params списка `/admin/users`.
 *
 * URL — внешний вход: битые значения не роняют страницу, а дают список
 * по умолчанию (как у вопросов, parse-admin-question-list-filters).
 *
 * - `q` — подстрока имени или почты; в SQL уходит параметром, не литералом;
 * - `guests=1` — показать и гостей (по умолчанию скрыты: их много, и в
 *   поддержке ищут игроков, а не анонимные куки);
 * - `page` — 1-based, размер страницы фиксирован (ADMIN_USER_LIST_PAGE_SIZE).
 */

export type AdminUserListFilters = {
    /** Подстрока имени/почты; пустая — без поиска. */
    q: string;
    /** true — в выдаче и гости. */
    guests: boolean;
    page: number;
};

export const DEFAULT_ADMIN_USER_LIST_FILTERS: AdminUserListFilters = {
    q: '',
    guests: false,
    page: 1,
};

/** Имя ≤ 32, почта ≤ 254 — длиннее искать нечего. */
const SEARCH_MAX_LENGTH = 100;
const PAGE_MAX = 10_000;

const schema = z.object({
    q: z.string().trim().max(SEARCH_MAX_LENGTH).default(''),
    guests: z.enum(['1']).optional(),
    page: z.coerce.number().int().min(1).max(PAGE_MAX).default(1),
});

function firstParam(value: string | string[] | undefined): string | undefined {
    const first = Array.isArray(value) ? value[0] : value;
    return first === undefined || first.trim() === '' ? undefined : first;
}

export function parseAdminUserListFilters(
    searchParams: Record<string, string | string[] | undefined>,
): AdminUserListFilters {
    const parsed = schema.safeParse({
        q: firstParam(searchParams.q),
        guests: firstParam(searchParams.guests),
        page: firstParam(searchParams.page),
    });

    if (!parsed.success) {
        return DEFAULT_ADMIN_USER_LIST_FILTERS;
    }

    return {
        q: parsed.data.q,
        guests: parsed.data.guests === '1',
        page: parsed.data.page,
    };
}

/** Сужает ли что-то список (для «никого не нашлось» vs «пока никого»). */
export function hasActiveAdminUserListFilters(
    filters: AdminUserListFilters,
): boolean {
    return filters.q.length > 0;
}

/** URL списка без «шумных» значений по умолчанию. */
export function buildAdminUserListHref(
    locale: string,
    filters: AdminUserListFilters,
): string {
    const params = new URLSearchParams();

    if (filters.q.length > 0) {
        params.set('q', filters.q);
    }

    if (filters.guests) {
        params.set('guests', '1');
    }

    if (filters.page > 1) {
        params.set('page', String(filters.page));
    }

    const query = params.toString();
    const base = `/${locale}/admin/users`;

    return query ? `${base}?${query}` : base;
}
