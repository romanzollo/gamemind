/**
 * Unit-тесты серии дней Челленджа (pure, без Neon).
 */

import { describe, expect, it } from 'vitest';

import { computeDailyStreak, msUntilNextMoscowDay } from './compute-daily-streak';

describe('computeDailyStreak', () => {
    it('counts consecutive days ending today', () => {
        const streak = computeDailyStreak(
            ['2026-10-29', '2026-10-30', '2026-10-31'],
            '2026-10-31',
        );

        expect(streak.current).toBe(3);
        expect(streak.best).toBe(3);
        expect(streak.playedToday).toBe(true);
        expect(streak.atRisk).toBe(false);
    });

    it('keeps the streak alive until midnight when today is not played yet', () => {
        const streak = computeDailyStreak(['2026-10-29', '2026-10-30'], '2026-10-31');

        expect(streak.current).toBe(2);
        expect(streak.playedToday).toBe(false);
        expect(streak.atRisk).toBe(true);
    });

    it('resets after a missed day but remembers the best run', () => {
        const streak = computeDailyStreak(
            ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-30'],
            '2026-10-31',
        );

        expect(streak.current).toBe(1);
        expect(streak.best).toBe(4);
        expect(streak.atRisk).toBe(true);
    });

    it('is zero with no recent days', () => {
        const streak = computeDailyStreak(['2026-10-20'], '2026-10-31');

        expect(streak.current).toBe(0);
        expect(streak.atRisk).toBe(false);
        expect(computeDailyStreak([], '2026-10-31').best).toBe(0);
    });

    it('crosses a year boundary and ignores duplicates', () => {
        const streak = computeDailyStreak(
            ['2026-12-31', '2027-01-01', '2027-01-01', '2026-12-30'],
            '2027-01-01',
        );

        expect(streak.current).toBe(3);
    });

    it('marks a new best only when today beats every earlier run', () => {
        expect(
            computeDailyStreak(['2026-10-30', '2026-10-31'], '2026-10-31').isNewBest,
        ).toBe(true);
        // Прежняя серия была длиннее — рекорд не побит.
        expect(
            computeDailyStreak(
                ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-30', '2026-10-31'],
                '2026-10-31',
            ).isNewBest,
        ).toBe(false);
        // Один день — ещё не рекорд серии.
        expect(computeDailyStreak(['2026-10-31'], '2026-10-31').isNewBest).toBe(false);
    });

    it('returns the last 7 days with today last', () => {
        const { lastDays } = computeDailyStreak(['2026-10-25', '2026-10-31'], '2026-10-31');

        expect(lastDays.map((day) => day.dateKey)).toEqual([
            '2026-10-25',
            '2026-10-26',
            '2026-10-27',
            '2026-10-28',
            '2026-10-29',
            '2026-10-30',
            '2026-10-31',
        ]);
        expect(lastDays.map((day) => day.played)).toEqual([
            true, false, false, false, false, false, true,
        ]);
        expect(lastDays.at(-1)?.isToday).toBe(true);
    });

    it('ignores future dates', () => {
        expect(computeDailyStreak(['2026-11-01'], '2026-10-31').best).toBe(0);
    });
});

describe('msUntilNextMoscowDay', () => {
    it('counts down to 00:00 Moscow (21:00 UTC)', () => {
        // 20:00 UTC = 23:00 МСК → час до полуночи.
        expect(msUntilNextMoscowDay(Date.UTC(2026, 9, 31, 20, 0, 0))).toBe(60 * 60 * 1000);
        // Ровно полночь МСК → следующие сутки целиком.
        expect(msUntilNextMoscowDay(Date.UTC(2026, 9, 31, 21, 0, 0))).toBe(24 * 60 * 60 * 1000);
    });
});
