import { describe, expect, it } from 'vitest';

import {
    buildAdminQuestionEditHref,
    buildAdminQuestionListHrefFromBack,
    parseAdminQuestionListBack,
    withAdminErrorParam,
} from '@/features/admin/lib/admin-question-list-back';

describe('parseAdminQuestionListBack', () => {
    it('keeps known filters and page in canonical order', () => {
        expect(
            parseAdminQuestionListBack('page=3&type=IMAGE_GUESS&q=zelda'),
        ).toBe('type=IMAGE_GUESS&q=zelda&page=3');
    });

    it('accepts a leading question mark', () => {
        expect(parseAdminQuestionListBack('?publication=DRAFT')).toBe(
            'publication=DRAFT',
        );
    });

    it('drops notice, error and unknown keys', () => {
        expect(
            parseAdminQuestionListBack(
                'notice=question_saved&error=DELETE_FAILED&next=//evil.com&page=2',
            ),
        ).toBe('page=2');
    });

    it('falls back to the default list for junk', () => {
        expect(parseAdminQuestionListBack('https://evil.com/x')).toBe('');
        expect(parseAdminQuestionListBack(null)).toBe('');
        expect(parseAdminQuestionListBack(42)).toBe('');
        expect(parseAdminQuestionListBack('type=HACK')).toBe('');
        expect(parseAdminQuestionListBack('x'.repeat(2000))).toBe('');
    });
});

describe('buildAdminQuestionListHrefFromBack', () => {
    it('always builds a path inside the admin list', () => {
        expect(
            buildAdminQuestionListHrefFromBack('ru', 'type=TEXT&page=2'),
        ).toBe('/ru/admin/questions?type=TEXT&page=2');
        expect(
            buildAdminQuestionListHrefFromBack('en', '//evil.com/admin'),
        ).toBe('/en/admin/questions');
    });
});

describe('buildAdminQuestionEditHref', () => {
    it('carries back only when there is something to return to', () => {
        expect(buildAdminQuestionEditHref('ru', 'q1', '')).toBe(
            '/ru/admin/questions/q1/edit',
        );
        expect(
            buildAdminQuestionEditHref('ru', 'q1', 'type=TEXT&page=2'),
        ).toBe('/ru/admin/questions/q1/edit?back=type%3DTEXT%26page%3D2');
    });
});

describe('withAdminErrorParam', () => {
    it('adds error and keeps filters', () => {
        expect(
            withAdminErrorParam(
                '/ru/admin/questions?page=2&notice=question_saved',
                'DELETE_FAILED',
            ),
        ).toBe('/ru/admin/questions?page=2&error=DELETE_FAILED');
        expect(withAdminErrorParam('/ru/admin/questions', 'NOT_FOUND')).toBe(
            '/ru/admin/questions?error=NOT_FOUND',
        );
    });
});
