/**
 * Unit-тесты парсинга leaderboard filters.
 *
 * Зачем: URL — внешний вход; битый `?difficulty=` / `?period=` / `?mode=`
 * не должен ронять страницу и не должен попасть в SQL как сырая строка.
 * Живая доска = Classic + week: пустой URL и мусорный period не должны
 * снова становиться all-time (иначе потолок 30 снова «навсегда»).
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
    period: 'week',
    mode: 'classic',
};

describe('parseLeaderboardFilters', () => {
    it('returns the live weekly Classic board when searchParams are empty', () => {
        const filters = parseLeaderboardFilters({});

        expect(filters).toEqual(DEFAULTS);
    });

    it('parses a valid difficulty from the URL without leaving the week board', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'HARD',
        });

        expect(filters).toEqual({
            difficulty: 'HARD',
            period: 'week',
            mode: 'classic',
        });
    });

    it('parses MIXED as a poolKind filter, not a question difficulty', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'MIXED',
        });

        expect(filters).toEqual({
            difficulty: 'MIXED',
            period: 'week',
            mode: 'classic',
        });
    });

    it('parses explicit all-time (hall of fame tab)', () => {
        const filters = parseLeaderboardFilters({
            period: 'all',
        });

        expect(filters).toEqual({
            difficulty: 'all',
            period: 'all',
            mode: 'classic',
        });
    });

    it('parses an explicit week the same as the omitted default', () => {
        const filters = parseLeaderboardFilters({
            period: 'week',
        });

        expect(filters).toEqual(DEFAULTS);
    });

    it('parses a Blitz board from ?mode=', () => {
        const filters = parseLeaderboardFilters({
            mode: 'blitz',
        });

        expect(filters).toEqual({
            difficulty: 'all',
            period: 'week',
            mode: 'blitz',
        });
    });

    it('parses difficulty, period and mode together', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'MEDIUM',
            period: 'month',
            mode: 'daily',
        });

        expect(filters).toEqual({
            difficulty: 'MEDIUM',
            period: 'month',
            mode: 'daily',
        });
    });

    it('falls back to all difficulties when difficulty is invalid', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'SUPER_HARD',
        });

        expect(filters).toEqual(DEFAULTS);
    });

    it('keeps a valid period when difficulty is invalid', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'SUPER_HARD',
            period: 'month',
        });

        expect(filters).toEqual({
            difficulty: 'all',
            period: 'month',
            mode: 'classic',
        });
    });

    it('keeps a valid mode when period is invalid (falls back to week, not all-time)', () => {
        const filters = parseLeaderboardFilters({
            mode: 'blitz',
            period: 'year',
        });

        expect(filters).toEqual({
            difficulty: 'all',
            period: 'week',
            mode: 'blitz',
        });
    });

    it('keeps a valid difficulty when period is invalid', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'HARD',
            period: 'year',
        });

        expect(filters).toEqual({
            difficulty: 'HARD',
            period: 'week',
            mode: 'classic',
        });
    });

    it('falls back to the live weekly board when period is invalid', () => {
        const filters = parseLeaderboardFilters({
            period: 'year',
        });

        expect(filters).toEqual(DEFAULTS);
    });

    it('parses Survival board from ?mode=', () => {
        const filters = parseLeaderboardFilters({
            mode: 'survival',
        });

        expect(filters).toEqual({
            difficulty: 'all',
            period: 'week',
            mode: 'survival',
        });
    });

    it('falls back to classic when mode is invalid', () => {
        const filters = parseLeaderboardFilters({
            mode: 'arena',
        });

        expect(filters).toEqual(DEFAULTS);
    });

    it('keeps a valid period when mode is invalid', () => {
        const filters = parseLeaderboardFilters({
            mode: 'arena',
            period: 'all',
        });

        expect(filters).toEqual({
            difficulty: 'all',
            period: 'all',
            mode: 'classic',
        });
    });

    it('uses the first value when a search param is an array', () => {
        const filters = parseLeaderboardFilters({
            difficulty: ['MEDIUM', 'HARD'],
            period: ['month', 'all'],
            mode: ['blitz', 'daily'],
        });

        expect(filters.difficulty).toBe('MEDIUM');
        expect(filters.period).toBe('month');
        expect(filters.mode).toBe('blitz');
    });

    it('treats empty string params as missing (Zod defaults)', () => {
        const filters = parseLeaderboardFilters({
            difficulty: '',
            period: '',
            mode: '',
        });

        expect(filters).toEqual(DEFAULTS);
    });
});

describe('hasActiveLeaderboardFilters', () => {
    it('is false for the live weekly Classic board', () => {
        expect(hasActiveLeaderboardFilters(DEFAULTS)).toBe(false);
    });

    it('is true when difficulty is set', () => {
        expect(
            hasActiveLeaderboardFilters({
                difficulty: 'EASY',
                period: 'week',
                mode: 'classic',
            }),
        ).toBe(true);
    });

    it('is true for the all-time tab', () => {
        expect(
            hasActiveLeaderboardFilters({
                difficulty: 'all',
                period: 'all',
                mode: 'classic',
            }),
        ).toBe(true);
    });

    it('is true when mode is not classic', () => {
        expect(
            hasActiveLeaderboardFilters({
                difficulty: 'all',
                period: 'week',
                mode: 'blitz',
            }),
        ).toBe(true);
    });
});

describe('buildLeaderboardHref', () => {
    it('omits query when filters are the live weekly Classic board', () => {
        expect(buildLeaderboardHref('ru', DEFAULTS)).toBe('/ru/leaderboard');
    });

    it('writes period=all so all-time is not an invisible default', () => {
        expect(
            buildLeaderboardHref('en', {
                difficulty: 'all',
                period: 'all',
                mode: 'classic',
            }),
        ).toBe('/en/leaderboard?period=all');
    });

    it('includes difficulty on the weekly board without repeating period=week', () => {
        expect(
            buildLeaderboardHref('en', {
                difficulty: 'HARD',
                period: 'week',
                mode: 'classic',
            }),
        ).toBe('/en/leaderboard?difficulty=HARD');
    });

    it('includes MIXED in the query so the filter is shareable', () => {
        expect(
            buildLeaderboardHref('ru', {
                difficulty: 'MIXED',
                period: 'week',
                mode: 'classic',
            }),
        ).toBe('/ru/leaderboard?difficulty=MIXED');
    });

    it('includes mode when not classic', () => {
        expect(
            buildLeaderboardHref('ru', {
                difficulty: 'all',
                period: 'week',
                mode: 'blitz',
            }),
        ).toBe('/ru/leaderboard?mode=blitz');
    });

    it('includes mode, period and difficulty in page-chip order', () => {
        expect(
            buildLeaderboardHref('en', {
                difficulty: 'EASY',
                period: 'month',
                mode: 'daily',
            }),
        ).toBe('/en/leaderboard?mode=daily&period=month&difficulty=EASY');
    });

    it('writes period=all together with difficulty', () => {
        expect(
            buildLeaderboardHref('en', {
                difficulty: 'HARD',
                period: 'all',
                mode: 'classic',
            }),
        ).toBe('/en/leaderboard?period=all&difficulty=HARD');
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
