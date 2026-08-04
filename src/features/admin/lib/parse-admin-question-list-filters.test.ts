/**
 * Unit-тесты парсинга admin question list filters.
 *
 * Зачем: URL — внешний вход; битые query не должны ронять страницу
 * и не должны «тихо» подставлять опасные значения в SQL.
 * Pure + Zod safeParse — без Neon (docs/TESTING.md Phase B).
 */

import { describe, expect, it } from 'vitest';

import {
    buildAdminQuestionListHref,
    getAdminQuestionListPageMeta,
    hasActiveAdminQuestionListFilters,
    parseAdminQuestionListFilters,
    type AdminQuestionListFilters,
} from './parse-admin-question-list-filters';

const DEFAULTS: AdminQuestionListFilters = {
    status: 'all',
    publication: 'all',
    difficulty: 'all',
    type: 'all',
    q: '',
    page: 1,
};

describe('parseAdminQuestionListFilters', () => {
    it('returns defaults when searchParams are empty', () => {
        const filters = parseAdminQuestionListFilters({});

        expect(filters).toEqual(DEFAULTS);
    });

    it('parses a full valid filter set from the URL', () => {
        const filters = parseAdminQuestionListFilters({
            status: 'active',
            publication: 'DRAFT',
            difficulty: 'HARD',
            type: 'IMAGE_GUESS',
            q: '  mario  ',
            page: '3',
        });

        expect(filters).toEqual({
            status: 'active',
            publication: 'DRAFT',
            difficulty: 'HARD',
            type: 'IMAGE_GUESS',
            q: 'mario',
            page: 3,
        });
    });

    it('falls back to all defaults when any value is invalid', () => {
        // Один битый ключ → safeParse fail → весь DEFAULT (не «частичный» parse)
        const filters = parseAdminQuestionListFilters({
            status: 'active',
            difficulty: 'SUPER_HARD',
        });

        expect(filters).toEqual(DEFAULTS);
    });

    it('falls back to defaults when page is invalid', () => {
        expect(
            parseAdminQuestionListFilters({
                page: '0',
            }),
        ).toEqual(DEFAULTS);

        expect(
            parseAdminQuestionListFilters({
                page: 'abc',
            }),
        ).toEqual(DEFAULTS);
    });

    it('uses the first value when a search param is an array', () => {
        const filters = parseAdminQuestionListFilters({
            status: ['inactive', 'active'],
        });

        expect(filters.status).toBe('inactive');
    });

    it('treats empty string params as missing (Zod defaults)', () => {
        const filters = parseAdminQuestionListFilters({
            status: '',
            publication: '   ',
            q: '',
            page: '',
        });

        expect(filters).toEqual(DEFAULTS);
    });
});

describe('hasActiveAdminQuestionListFilters', () => {
    it('returns false for defaults', () => {
        expect(hasActiveAdminQuestionListFilters(DEFAULTS)).toBe(false);
    });

    it('ignores page when deciding if filters are active', () => {
        expect(
            hasActiveAdminQuestionListFilters({
                ...DEFAULTS,
                page: 4,
            }),
        ).toBe(false);
    });

    it('returns true when any filter differs from defaults', () => {
        expect(
            hasActiveAdminQuestionListFilters({
                ...DEFAULTS,
                status: 'active',
            }),
        ).toBe(true);

        expect(
            hasActiveAdminQuestionListFilters({
                ...DEFAULTS,
                q: 'zelda',
            }),
        ).toBe(true);
    });
});

describe('buildAdminQuestionListHref', () => {
    it('returns the bare list path when filters are defaults', () => {
        expect(buildAdminQuestionListHref('ru', DEFAULTS)).toBe(
            '/ru/admin/questions',
        );
    });

    it('omits all/empty keys and keeps only active constraints', () => {
        const href = buildAdminQuestionListHref('en', {
            status: 'inactive',
            publication: 'all',
            difficulty: 'EASY',
            type: 'all',
            q: 'sonic',
            page: 1,
        });

        expect(href).toBe(
            '/en/admin/questions?status=inactive&difficulty=EASY&q=sonic',
        );
    });

    it('includes page only when greater than 1', () => {
        const href = buildAdminQuestionListHref('ru', {
            ...DEFAULTS,
            page: 2,
        });

        expect(href).toBe('/ru/admin/questions?page=2');
    });
});

describe('getAdminQuestionListPageMeta', () => {
    it('computes from/to for a middle page', () => {
        expect(getAdminQuestionListPageMeta(80, 2, 25)).toEqual({
            page: 2,
            pageSize: 25,
            totalCount: 80,
            totalPages: 4,
            from: 26,
            to: 50,
        });
    });

    it('clamps page above totalPages', () => {
        expect(getAdminQuestionListPageMeta(10, 99, 25)).toEqual({
            page: 1,
            pageSize: 25,
            totalCount: 10,
            totalPages: 1,
            from: 1,
            to: 10,
        });
    });

    it('returns zero range when empty', () => {
        expect(getAdminQuestionListPageMeta(0, 3, 25)).toEqual({
            page: 1,
            pageSize: 25,
            totalCount: 0,
            totalPages: 1,
            from: 0,
            to: 0,
        });
    });
});
