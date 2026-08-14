/**
 * Unit-тесты подписи чипа сложности сессии.
 * Mix не должен резолвиться в medium/hard label.
 */

import { describe, expect, it } from 'vitest';

import {
    getSessionDifficultyChipToneClass,
    getSessionDifficultyLabel,
} from './session-difficulty-label';

const labels = {
    easy: 'Легко',
    medium: 'Средне',
    hard: 'Сложно',
    mixed: 'Смешанная',
};

describe('getSessionDifficultyLabel', () => {
    it('uses mixed copy for MIXED, not medium', () => {
        expect(getSessionDifficultyLabel('MIXED', labels)).toBe('Смешанная');
        expect(getSessionDifficultyLabel('MEDIUM', labels)).toBe('Средне');
    });
});

describe('getSessionDifficultyChipToneClass', () => {
    it('does not reuse warning (medium) for mixed', () => {
        expect(getSessionDifficultyChipToneClass('MIXED')).toBe('text-info');
        expect(getSessionDifficultyChipToneClass('MEDIUM')).toBe('text-warning');
    });
});
