/**
 * Серия дней в Челлендже (pure, без Neon и без часовых поясов).
 *
 * Вход — московские даты (`YYYY-MM-DD`) дней, где у игрока есть результат
 * Челленджа, и «сегодня» по Москве. Даты сравниваем как номера дней (UTC
 * от ключа), поэтому пояс сервера и переход года не влияют.
 *
 * - current: дни подряд, заканчивающиеся сегодня; если сегодня ещё не
 *   сыграно — заканчивающиеся вчера (серия «жива» до полуночи по Москве);
 * - best: самая длинная серия за всё время (тот же смысл, что
 *   daily_best_streak в фактах достижений);
 * - lastDays: последние 7 дней по порядку, сегодня — последний;
 * - isNewBest: сегодня сыграно и серия длиннее любой прежней (от 2 дней).
 *
 * ADR: docs/DECISIONS.md → Daily streak.
 */

import type { DailyChallengeDateKey } from '@/features/daily-challenge/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_DAYS = 7;

export type DailyStreakDay = {
    dateKey: DailyChallengeDateKey;
    played: boolean;
    isToday: boolean;
};

export type DailyStreak = {
    current: number;
    best: number;
    playedToday: boolean;
    /** Серия есть, но сегодня ещё не сыграно — прервётся в полночь. */
    atRisk: boolean;
    isNewBest: boolean;
    lastDays: DailyStreakDay[];
};

function toDayNumber(dateKey: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

    if (!match) {
        return null;
    }

    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

function toDateKey(dayNumber: number): DailyChallengeDateKey {
    return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

function longestRun(days: readonly number[]): number {
    let best = 0;
    let run = 0;
    let previous: number | null = null;

    for (const day of days) {
        run = previous != null && day === previous + 1 ? run + 1 : 1;
        best = Math.max(best, run);
        previous = day;
    }

    return best;
}

function runEndingAt(played: ReadonlySet<number>, lastDay: number): number {
    let length = 0;

    while (played.has(lastDay - length)) {
        length += 1;
    }

    return length;
}

export function computeDailyStreak(
    playedDateKeys: readonly string[],
    todayKey: DailyChallengeDateKey,
): DailyStreak {
    const today = toDayNumber(todayKey);
    const played = new Set<number>();

    for (const key of playedDateKeys) {
        const day = toDayNumber(key);
        // Будущие даты (часы/данные) не считаем — серия только по прошлому.
        if (day != null && (today == null || day <= today)) {
            played.add(day);
        }
    }

    const sorted = [...played].sort((left, right) => left - right);
    const best = longestRun(sorted);

    if (today == null) {
        return {
            current: 0,
            best,
            playedToday: false,
            atRisk: false,
            isNewBest: false,
            lastDays: [],
        };
    }

    const playedToday = played.has(today);
    const current = runEndingAt(played, playedToday ? today : today - 1);
    const bestBeforeToday = longestRun(sorted.filter((day) => day !== today));

    return {
        current,
        best,
        playedToday,
        atRisk: current > 0 && !playedToday,
        isNewBest: playedToday && current >= 2 && current > bestBeforeToday,
        lastDays: Array.from({ length: LAST_DAYS }, (_, index) => {
            const day = today - (LAST_DAYS - 1 - index);
            return {
                dateKey: toDateKey(day),
                played: played.has(day),
                isToday: day === today,
            };
        }),
    };
}

/** Миллисекунды до следующей полуночи по Москве (UTC+3, без перехода на летнее время). */
export function msUntilNextMoscowDay(nowMs: number): number {
    const moscowOffsetMs = 3 * 60 * 60 * 1000;
    const moscowNow = nowMs + moscowOffsetMs;
    const nextMidnight = (Math.floor(moscowNow / DAY_MS) + 1) * DAY_MS;

    return nextMidnight - moscowNow;
}
