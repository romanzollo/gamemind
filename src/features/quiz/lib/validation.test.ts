/**
 * Unit-тесты Zod старта Classic (в т.ч. option MIXED).
 *
 * Зачем: FormData — внешний вход; MIXED+7 не должен пройти в pick.
 * Pure safeParse — без Neon.
 */

import { describe, expect, it } from 'vitest';

import {
    isQuestionDifficulty,
    quizSetupSchema,
    timedQuizSetupSchema,
} from './validation';

describe('quizSetupSchema', () => {
    it('accepts a single-difficulty Classic setup', () => {
        const parsed = quizSetupSchema.safeParse({
            difficulty: 'EASY',
            questionCount: '3',
        });

        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data).toEqual({
                difficulty: 'EASY',
                questionCount: 3,
            });
        }
    });

    it('accepts MIXED on locked lengths 3, 5 and 10', () => {
        for (const questionCount of ['3', '5', '10'] as const) {
            const parsed = quizSetupSchema.safeParse({
                difficulty: 'MIXED',
                questionCount,
            });

            expect(parsed.success).toBe(true);
        }
    });

    it('rejects MIXED when there is no locked split', () => {
        const parsed = quizSetupSchema.safeParse({
            difficulty: 'MIXED',
            questionCount: '7',
        });

        expect(parsed.success).toBe(false);
    });

    it('rejects values that are not a setup option', () => {
        const parsed = quizSetupSchema.safeParse({
            difficulty: 'SUPER_HARD',
            questionCount: '3',
        });

        expect(parsed.success).toBe(false);
    });
});

describe('isQuestionDifficulty', () => {
    it('narrows MIXED away from question/cycle Difficulty', () => {
        expect(isQuestionDifficulty('EASY')).toBe(true);
        expect(isQuestionDifficulty('MIXED')).toBe(false);
    });
});

describe('timedQuizSetupSchema', () => {
    it('accepts MIXED (Blitz count is always 10)', () => {
        const parsed = timedQuizSetupSchema.safeParse({
            difficulty: 'MIXED',
        });

        expect(parsed.success).toBe(true);
    });

    it('rejects values that are not a setup option', () => {
        const parsed = timedQuizSetupSchema.safeParse({
            difficulty: 'SUPER_HARD',
        });

        expect(parsed.success).toBe(false);
    });
});
