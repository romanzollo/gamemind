/**
 * Unit-тесты парсинга leaderboard filters.
 *
 * Зачем: URL — внешний вход; битый `?difficulty=` / `?period=` не должен
 * ронять страницу и не должен попасть в SQL как «сырая» строка.
 * Pure + Zod safeParse — без Neon (docs/TESTING.md Phase B pattern).
 */

import { describe, expect, it } from 'vitest';

import {
    buildLeaderboardHref,
    getLeaderboardPeriodCutoff,
    hasActiveLeaderboardFilters,
    parseLeaderboardFilters,
    type LeaderboardFilters,
} from './parse-leaderboard-filters';

const DEFAULTS: LeaderboardFilters = {
    difficulty: 'all',
    period: 'all',
};

describe('parseLeaderboardFilters', () => {
    it('returns defaults when searchParams are empty', () => {
        const filters = parseLeaderboardFilters({});

        expect(filters).toEqual(DEFAULTS);
    });

    it('parses a valid difficulty from the URL', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'HARD',
        });

        expect(filters).toEqual({ difficulty: 'HARD', period: 'all' });
    });

    it('parses a valid period from the URL', () => {
        const filters = parseLeaderboardFilters({
            period: 'week',
        });

        expect(filters).toEqual({ difficulty: 'all', period: 'week' });
    });

    it('parses difficulty and period together', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'MEDIUM',
            period: 'month',
        });

        expect(filters).toEqual({ difficulty: 'MEDIUM', period: 'month' });
    });

    it('falls back to all when difficulty is invalid', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'SUPER_HARD',
        });

        expect(filters).toEqual(DEFAULTS);
    });

    it('keeps valid period when difficulty is invalid', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'SUPER_HARD',
            period: 'week',
        });

        expect(filters).toEqual({ difficulty: 'all', period: 'week' });
    });

    it('keeps valid difficulty when period is invalid', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'HARD',
            period: 'year',
        });

        expect(filters).toEqual({ difficulty: 'HARD', period: 'all' });
    });

    it('falls back to defaults when period is invalid', () => {
        const filters = parseLeaderboardFilters({
            period: 'year',
        });

        expect(filters).toEqual(DEFAULTS);
    });

    it('uses the first value when a search param is an array', () => {
        const filters = parseLeaderboardFilters({
            difficulty: ['MEDIUM', 'HARD'],
            period: ['week', 'month'],
        });

        expect(filters.difficulty).toBe('MEDIUM');
        expect(filters.period).toBe('week');
    });

    it('treats empty string params as missing (Zod defaults)', () => {
        const filters = parseLeaderboardFilters({
            difficulty: '',
            period: '',
        });

        expect(filters).toEqual(DEFAULTS);
    });
});

describe('hasActiveLeaderboardFilters', () => {
    it('is false for defaults', () => {
        expect(hasActiveLeaderboardFilters(DEFAULTS)).toBe(false);
    });

    it('is true when difficulty is set', () => {
        expect(
            hasActiveLeaderboardFilters({
                difficulty: 'EASY',
                period: 'all',
            }),
        ).toBe(true);
    });

    it('is true when period is set', () => {
        expect(
            hasActiveLeaderboardFilters({
                difficulty: 'all',
                period: 'week',
            }),
        ).toBe(true);
    });
});

describe('buildLeaderboardHref', () => {
    it('omits query when filters are defaults', () => {
        expect(buildLeaderboardHref('ru', DEFAULTS)).toBe('/ru/leaderboard');
    });

    it('includes difficulty when filtered', () => {
        expect(
            buildLeaderboardHref('en', {
                difficulty: 'HARD',
                period: 'all',
            }),
        ).toBe('/en/leaderboard?difficulty=HARD');
    });

    it('includes period when filtered', () => {
        expect(
            buildLeaderboardHref('ru', {
                difficulty: 'all',
                period: 'week',
            }),
        ).toBe('/ru/leaderboard?period=week');
    });

    it('includes both difficulty and period', () => {
        expect(
            buildLeaderboardHref('en', {
                difficulty: 'EASY',
                period: 'month',
            }),
        ).toBe('/en/leaderboard?difficulty=EASY&period=month');
    });
});

describe('getLeaderboardPeriodCutoff', () => {
    const now = new Date('2026-07-29T12:00:00.000Z');

    it('returns null for all-time', () => {
        expect(getLeaderboardPeriodCutoff('all', now)).toBeNull();
    });

    it('subtracts 7 days for week', () => {
        expect(getLeaderboardPeriodCutoff('week', now)?.toISOString()).toBe(
            '2026-07-22T12:00:00.000Z',
        );
    });

    it('subtracts 30 days for month', () => {
        expect(getLeaderboardPeriodCutoff('month', now)?.toISOString()).toBe(
            '2026-06-29T12:00:00.000Z',
        );
    });
});
