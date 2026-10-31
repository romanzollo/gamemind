import { describe, expect, it } from 'vitest';

import { formatPlural } from './format-plural';

const RU = { one: '{n} день', few: '{n} дня', many: '{n} дней', other: '{n} дня' };
const EN = { one: '{n} day', few: '{n} days', many: '{n} days', other: '{n} days' };

describe('formatPlural', () => {
    it('picks Russian forms', () => {
        expect(formatPlural('ru', 1, RU)).toBe('1 день');
        expect(formatPlural('ru', 3, RU)).toBe('3 дня');
        expect(formatPlural('ru', 5, RU)).toBe('5 дней');
        expect(formatPlural('ru', 11, RU)).toBe('11 дней');
        expect(formatPlural('ru', 21, RU)).toBe('21 день');
        expect(formatPlural('ru', 22, RU)).toBe('22 дня');
    });

    it('picks English forms', () => {
        expect(formatPlural('en', 1, EN)).toBe('1 day');
        expect(formatPlural('en', 2, EN)).toBe('2 days');
    });
});
