/**
 * Unit-тесты allowlist `?notice=` для admin success toasts.
 */

import { describe, expect, it } from 'vitest';

import {
    appendAdminNotice,
    isAdminNoticeCode,
    parseAdminNotice,
} from '@/features/admin/lib/parse-admin-notice';

describe('isAdminNoticeCode', () => {
    it('accepts known codes', () => {
        expect(isAdminNoticeCode('question_saved')).toBe(true);
        expect(isAdminNoticeCode('bulk_published')).toBe(true);
    });

    it('rejects unknown', () => {
        expect(isAdminNoticeCode('hack')).toBe(false);
        expect(isAdminNoticeCode('')).toBe(false);
    });
});

describe('parseAdminNotice', () => {
    it('returns null for missing or invalid', () => {
        expect(parseAdminNotice(undefined)).toBeNull();
        expect(parseAdminNotice('')).toBeNull();
        expect(parseAdminNotice('nope')).toBeNull();
    });

    it('parses allowlisted code', () => {
        expect(parseAdminNotice('bulk_deactivated')).toBe('bulk_deactivated');
        expect(parseAdminNotice(['question_saved', 'other'])).toBe(
            'question_saved',
        );
    });
});

describe('appendAdminNotice', () => {
    it('adds notice to clean path', () => {
        expect(appendAdminNotice('/ru/admin/questions', 'question_saved')).toBe(
            '/ru/admin/questions?notice=question_saved',
        );
    });

    it('replaces error and sets notice', () => {
        expect(
            appendAdminNotice(
                '/ru/admin/questions?error=DELETE_FAILED&difficulty=EASY',
                'bulk_activated',
            ),
        ).toBe(
            '/ru/admin/questions?difficulty=EASY&notice=bulk_activated',
        );
    });
});
