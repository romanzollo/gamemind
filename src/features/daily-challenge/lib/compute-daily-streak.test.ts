/**
 * Unit-тесты серии дней Челленджа (pure, без Neon).
 */

import { describe, expect, it } from 'vitest';

import {
    computeDailyStreak,
    findNextStreakMilestone,
    msUntilNextMoscowDay,
} from './compute-daily-streak';

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

    it('returns the Monday–Sunday week with today and future days marked', () => {
        // 31.10.2026 — суббота: неделя 26.10 (пн) … 01.11 (вс).
        const streak = computeDailyStreak(['2026-10-25', '2026-10-29', '2026-10-30'], '2026-10-31');

        expect(streak.week.map((day) => day.dateKey)).toEqual([
            '2026-10-26',
            '2026-10-27',
            '2026-10-28',
            '2026-10-29',
            '2026-10-30',
            '2026-10-31',
            '2026-11-01',
        ]);
        // Воскресенье 25.10 — прошлая неделя, в сетку не попадает.
        expect(streak.week.map((day) => day.played)).toEqual([
            false, false, false, true, true, false, false,
        ]);
        expect(streak.week[5]?.isToday).toBe(true);
        expect(streak.week.map((day) => day.isFuture)).toEqual([
            false, false, false, false, false, false, true,
        ]);
        expect(streak.weekElapsedDays).toBe(6);
        // Серия идёт с прошлой недели: счётчик не сбрасывается с понедельником.
        expect(streak.current).toBe(2);
        expect(streak.perfectWeek).toBe(false);
    });

    it('starts the week on Monday when today is Monday', () => {
        const streak = computeDailyStreak(['2026-11-01', '2026-11-02'], '2026-11-02');

        expect(streak.week[0]).toEqual({
            dateKey: '2026-11-02',
            played: true,
            isToday: true,
            isFuture: false,
        });
        expect(streak.weekElapsedDays).toBe(1);
        expect(streak.current).toBe(2);
    });

    it('marks a perfect week when all seven days are played', () => {
        const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];

        expect(computeDailyStreak(days, '2026-11-01').perfectWeek).toBe(true);
        expect(computeDailyStreak(days.slice(0, 6), '2026-11-01').perfectWeek).toBe(false);
    });

    it('ignores future dates', () => {
        expect(computeDailyStreak(['2026-11-01'], '2026-10-31').best).toBe(0);
    });
});

describe('findNextStreakMilestone', () => {
    const milestones = [
        { code: 'DAILY_STREAK_7', threshold: 7 },
        { code: 'DAILY_STREAK_3', threshold: 3 },
        { code: 'DAILY_STREAK_30', threshold: 30 },
    ];

    it('points to the smallest threshold above the best streak', () => {
        expect(findNextStreakMilestone({ current: 2, best: 2 }, milestones)).toEqual({
            code: 'DAILY_STREAK_3',
            threshold: 3,
            daysLeft: 1,
        });
    });

    it('skips milestones already earned by the best streak', () => {
        // Рекорд 7 (ачивки 3 и 7 уже есть), сейчас серия 2 → цель 30, ещё 28 дней.
        expect(findNextStreakMilestone({ current: 2, best: 7 }, milestones)).toEqual({
            code: 'DAILY_STREAK_30',
            threshold: 30,
            daysLeft: 28,
        });
    });

    it('returns null when every milestone is earned', () => {
        expect(findNextStreakMilestone({ current: 31, best: 31 }, milestones)).toBeNull();
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
