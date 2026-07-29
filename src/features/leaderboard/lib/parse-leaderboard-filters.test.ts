/**
 * Unit-тесты парсинга leaderboard filters.
 *
 * Зачем: URL — внешний вход; битый `?difficulty=` не должен ронять страницу
 * и не должен попасть в SQL как «сырая» строка.
 * Pure + Zod safeParse — без Neon (docs/TESTING.md Phase B pattern).
 */

import { describe, expect, it } from 'vitest';

import {
    buildLeaderboardHref,
    hasActiveLeaderboardFilters,
    parseLeaderboardFilters,
    type LeaderboardFilters,
} from './parse-leaderboard-filters';

const DEFAULTS: LeaderboardFilters = {
    difficulty: 'all',
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

        expect(filters).toEqual({ difficulty: 'HARD' });
    });

    it('falls back to all when difficulty is invalid', () => {
        const filters = parseLeaderboardFilters({
            difficulty: 'SUPER_HARD',
        });

        expect(filters).toEqual(DEFAULTS);
    });

    it('uses the first value when a search param is an array', () => {
        const filters = parseLeaderboardFilters({
            difficulty: ['MEDIUM', 'HARD'],
        });

        expect(filters.difficulty).toBe('MEDIUM');
    });

    it('treats empty string params as missing (Zod defaults)', () => {
        const filters = parseLeaderboardFilters({
            difficulty: '',
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
            hasActiveLeaderboardFilters({ difficulty: 'EASY' }),
        ).toBe(true);
    });
});

describe('buildLeaderboardHref', () => {
    it('omits query when difficulty is all', () => {
        expect(buildLeaderboardHref('ru', DEFAULTS)).toBe('/ru/leaderboard');
    });

    it('includes difficulty when filtered', () => {
        expect(
            buildLeaderboardHref('en', { difficulty: 'HARD' }),
        ).toBe('/en/leaderboard?difficulty=HARD');
    });
});
