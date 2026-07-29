import { z } from 'zod';

import type { Difficulty } from '@/types';

/**
 * Парсинг search params страницы `/leaderboard`.
 *
 * Зачем отдельный модуль:
 * - URL — внешний вход (как FormData); валидируем до репозитория;
 * - невалидные `?difficulty=` не роняют страницу — fallback на «все сложности»;
 * - один контракт page → SQL WHERE по `QuizSession.difficulty`.
 *
 * MVP: только difficulty. Период / категория — позже, без ломки этого API.
 *
 * См. DECISIONS.md → Leaderboard; ROADMAP §6 later period/difficulty.
 */

/** Нормализованный фильтр рейтинга (после parse). */
export type LeaderboardFilters = {
    /** Сессия квиза; `all` = без WHERE по difficulty (глобальный best). */
    difficulty: Difficulty | 'all';
};

const DEFAULT_FILTERS: LeaderboardFilters = {
    difficulty: 'all',
};

const leaderboardFiltersSchema = z.object({
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'all']).default('all'),
});

function firstParam(
    value: string | string[] | undefined,
): string | undefined {
    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
}

/** Пустая строка из GET = «параметра нет» (Zod default), не ошибка. */
function emptyToUndefined(value: string | undefined): string | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined;
    }

    return value;
}

/**
 * Преобразует сырые searchParams страницы в безопасные фильтры.
 * При любой ошибке Zod — defaults (не throw на публичной странице).
 */
export function parseLeaderboardFilters(
    searchParams: Record<string, string | string[] | undefined>,
): LeaderboardFilters {
    const parsed = leaderboardFiltersSchema.safeParse({
        difficulty: emptyToUndefined(firstParam(searchParams.difficulty)),
    });

    if (!parsed.success) {
        return DEFAULT_FILTERS;
    }

    return parsed.data;
}

/**
 * Есть ли активный фильтр (для UI «сбросить» / пустого empty copy).
 */
export function hasActiveLeaderboardFilters(
    filters: LeaderboardFilters,
): boolean {
    return filters.difficulty !== 'all';
}

/**
 * Собирает href рейтинга с учётом locale и фильтров.
 * `all` / пустое — не пишем в URL (чистая ссылка = глобальный рейтинг).
 */
export function buildLeaderboardHref(
    locale: string,
    filters: LeaderboardFilters,
): string {
    const params = new URLSearchParams();

    if (filters.difficulty !== 'all') {
        params.set('difficulty', filters.difficulty);
    }

    const query = params.toString();
    const base = `/${locale}/leaderboard`;

    return query ? `${base}?${query}` : base;
}
