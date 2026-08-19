import { z } from 'zod';

import type { QuizSetupDifficulty } from '@/types';

/**
 * Парсинг search params страницы `/leaderboard`.
 *
 * Зачем отдельный модуль:
 * - URL — внешний вход (как FormData); валидируем до репозитория;
 * - невалидные `?difficulty=` / `?period=` / `?mode=` не роняют страницу;
 * - один контракт page → SQL WHERE (mode / difficulty / poolKind / completedAt).
 *
 * Живая доска (Layer 1, DECISIONS.md → Leaderboard retention meta):
 * пустой URL = Classic + скользящая неделя. All-time — явная вкладка `?period=all`.
 *
 * Период = скользящее окно, не календарный понедельник:
 * week = последние 7×24ч, month = 30×24ч, all = без нижней границы.
 * В UI: «недельный рейтинг — игры за последние 7 дней»; не обещать
 * сброс в понедельник. All-time (`period=all`) без нижней границы.
 *
 * Режим обязателен и взаимоисключающ (не смешивать потолки Classic/Blitz/Daily).
 *
 * См. DECISIONS.md → Leaderboard retention meta — Layer 1.
 */

/** Период рейтинга после parse. */
export type LeaderboardPeriod = 'week' | 'month' | 'all';

/**
 * Режим доски. Не QuizSession.status и не play-mode Survival.
 * SQL: скаляры `dailyChallengeId` / `timedEndsAt` (не snapshotData).
 */
export type LeaderboardMode = 'classic' | 'blitz' | 'daily';

/** Сложность рейтинга после parse. `MIXED` = poolKind, не Question.difficulty. */
export type LeaderboardDifficultyFilter = QuizSetupDifficulty | 'all';

/** Нормализованный фильтр рейтинга (после parse). */
export type LeaderboardFilters = {
    /**
     * `all` = все сложности **внутри выбранного mode** (JOIN Session всё равно нужен).
     * EASY|MEDIUM|HARD = SINGLE + эта difficulty (mix не в Medium).
     * MIXED = poolKind MIXED.
     */
    difficulty: LeaderboardDifficultyFilter;
    /**
     * Окно по `QuizResult.completedAt`.
     * Default живой доски — `week`; `all` = зал славы без нижней границы.
     */
    period: LeaderboardPeriod;
    /** Default — classic. Нет значения «все режимы»: потолки разные. */
    mode: LeaderboardMode;
};

const DEFAULT_FILTERS: LeaderboardFilters = {
    difficulty: 'all',
    period: 'week',
    mode: 'classic',
};

const leaderboardFiltersSchema = z.object({
    // Независимое catch: битый ключ не должен сбрасывать остальные.
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'MIXED', 'all']).catch('all'),
    period: z.enum(['week', 'month', 'all']).catch('week'),
    mode: z.enum(['classic', 'blitz', 'daily']).catch('classic'),
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
        mode: emptyToUndefined(firstParam(searchParams.mode)),
    });

    if (!parsed.success) {
        return DEFAULT_FILTERS;
    }

    return parsed.data;
}

/**
 * Есть ли отклонение от живой доски (Classic + неделя + все сложности).
 * Нужно для emptyFiltered: «нет игр на неделе» ≠ «нет HARD за всё время».
 */
export function hasActiveLeaderboardFilters(
    filters: LeaderboardFilters,
): boolean {
    return (
        filters.difficulty !== 'all' ||
        filters.period !== 'week' ||
        filters.mode !== 'classic'
    );
}

/**
 * Собирает href рейтинга с учётом locale и фильтров.
 * Живая доска (classic + week + all difficulties) = чистый `/leaderboard`.
 * All-time пишем явно (`period=all`), иначе снова станет «невидимым» default.
 */
export function buildLeaderboardHref(
    locale: string,
    filters: LeaderboardFilters,
): string {
    const params = new URLSearchParams();

    if (filters.mode !== 'classic') {
        params.set('mode', filters.mode);
    }

    if (filters.period !== 'week') {
        params.set('period', filters.period);
    }

    if (filters.difficulty !== 'all') {
        params.set('difficulty', filters.difficulty);
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
