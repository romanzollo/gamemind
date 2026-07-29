import { z } from 'zod';

import type { Difficulty } from '@/types';

/**
 * Парсинг search params страницы `/leaderboard`.
 *
 * Зачем отдельный модуль:
 * - URL — внешний вход (как FormData); валидируем до репозитория;
 * - невалидные `?difficulty=` / `?period=` не роняют страницу — fallback на defaults;
 * - один контракт page → SQL WHERE (difficulty / completedAt).
 *
 * Период = скользящее окно (rolling), не календарная неделя/месяц:
 * week = последние 7×24ч, month = 30×24ч, all = без нижней границы даты.
 * Так проще объяснить игроку и нет споров про таймзону «чей понедельник».
 *
 * См. DECISIONS.md → Leaderboard; ROADMAP §6 later period.
 */

/** Период рейтинга после parse. */
export type LeaderboardPeriod = 'week' | 'month' | 'all';

/** Нормализованный фильтр рейтинга (после parse). */
export type LeaderboardFilters = {
    /** Сессия квиза; `all` = без WHERE по difficulty (глобальный best). */
    difficulty: Difficulty | 'all';
    /** Окно по `QuizResult.completedAt`; `all` = без нижней границы. */
    period: LeaderboardPeriod;
};

const DEFAULT_FILTERS: LeaderboardFilters = {
    difficulty: 'all',
    period: 'all',
};

const leaderboardFiltersSchema = z.object({
    // Независимое catch: битый difficulty не должен сбрасывать валидный period (и наоборот).
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'all']).catch('all'),
    period: z.enum(['week', 'month', 'all']).catch('all'),
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
        period: emptyToUndefined(firstParam(searchParams.period)),
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
    return filters.difficulty !== 'all' || filters.period !== 'all';
}

/**
 * Собирает href рейтинга с учётом locale и фильтров.
 * `all` / пустое — не пишем в URL (чистая ссылка = глобальный all-time рейтинг).
 */
export function buildLeaderboardHref(
    locale: string,
    filters: LeaderboardFilters,
): string {
    const params = new URLSearchParams();

    if (filters.difficulty !== 'all') {
        params.set('difficulty', filters.difficulty);
    }

    if (filters.period !== 'all') {
        params.set('period', filters.period);
    }

    const query = params.toString();
    const base = `/${locale}/leaderboard`;

    return query ? `${base}?${query}` : base;
}

/**
 * Нижняя граница `completedAt` для SQL (скользящее окно).
 * `all` → `null` (не добавляем WHERE по дате).
 *
 * Считаем в JS и передаём параметром в pg — предсказуемее, чем `NOW() - interval`
 * размазанный по веткам SQL, и проще покрыть тестом без Neon.
 */
export function getLeaderboardPeriodCutoff(
    period: LeaderboardPeriod,
    now: Date = new Date(),
): Date | null {
    if (period === 'all') {
        return null;
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    const days = period === 'week' ? 7 : 30;

    return new Date(now.getTime() - days * msPerDay);
}
