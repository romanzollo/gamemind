import { describe, expect, it } from 'vitest';

import {
    DEFAULT_ADMIN_USER_LIST_FILTERS,
    buildAdminUserListHref,
    hasActiveAdminUserListFilters,
    parseAdminUserListFilters,
} from './parse-admin-user-list-filters';

describe('parseAdminUserListFilters', () => {
    it('hides guests and starts on page 1 by default', () => {
        expect(parseAdminUserListFilters({})).toEqual(
            DEFAULT_ADMIN_USER_LIST_FILTERS,
        );
    });

    it('reads search, guests and page', () => {
        expect(
            parseAdminUserListFilters({ q: '  roman ', guests: '1', page: '3' }),
        ).toEqual({ q: 'roman', guests: true, page: 3 });
    });

    it('takes the first value of repeated params', () => {
        expect(
            parseAdminUserListFilters({ q: ['a', 'b'], page: ['2', '9'] }),
        ).toEqual({ q: 'a', guests: false, page: 2 });
    });

    it('falls back to defaults on junk', () => {
        expect(parseAdminUserListFilters({ page: '-1' })).toEqual(
            DEFAULT_ADMIN_USER_LIST_FILTERS,
        );
        expect(parseAdminUserListFilters({ guests: 'yes' })).toEqual(
            DEFAULT_ADMIN_USER_LIST_FILTERS,
        );
        expect(parseAdminUserListFilters({ q: 'x'.repeat(101) })).toEqual(
            DEFAULT_ADMIN_USER_LIST_FILTERS,
        );
    });
});

describe('buildAdminUserListHref', () => {
    it('omits defaults', () => {
        expect(
            buildAdminUserListHref('ru', DEFAULT_ADMIN_USER_LIST_FILTERS),
        ).toBe('/ru/admin/users');
    });

    it('round-trips through the parser', () => {
        const filters = { q: 'test@mail', guests: true, page: 2 };
        const href = buildAdminUserListHref('en', filters);
        expect(href).toBe('/en/admin/users?q=test%40mail&guests=1&page=2');
        const query = Object.fromEntries(
            new URLSearchParams(href.split('?')[1]).entries(),
        );
        expect(parseAdminUserListFilters(query)).toEqual(filters);
    });
});

describe('hasActiveAdminUserListFilters', () => {
    it('counts only search as narrowing', () => {
        expect(
            hasActiveAdminUserListFilters(DEFAULT_ADMIN_USER_LIST_FILTERS),
        ).toBe(false);
        expect(
            hasActiveAdminUserListFilters({
                ...DEFAULT_ADMIN_USER_LIST_FILTERS,
                q: 'a',
            }),
        ).toBe(true);
    });
});
