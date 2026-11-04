import { describe, expect, it } from 'vitest';

import { withPageParam } from './AdminListPagination';

describe('withPageParam', () => {
    it('sets page and keeps filters', () => {
        expect(withPageParam('/ru/admin/users?q=ro&guests=1', 3)).toBe(
            '/ru/admin/users?q=ro&guests=1&page=3',
        );
    });

    it('drops page for the first page and replaces an old one', () => {
        expect(withPageParam('/ru/admin/questions?page=4&type=TEXT', 1)).toBe(
            '/ru/admin/questions?type=TEXT',
        );
        expect(withPageParam('/ru/admin/users', 1)).toBe('/ru/admin/users');
        expect(withPageParam('/ru/admin/users?page=2', 5)).toBe(
            '/ru/admin/users?page=5',
        );
    });
});
