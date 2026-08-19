/**
 * Unit-тесты Zod старта Survival.
 *
 * Зачем: FormData не должна протащить MIXED в cycle bag / CHECK poolKind.
 * Pure safeParse — без Neon.
 */

import { describe, expect, it } from 'vitest';

import { survivalQuizSetupSchema } from './survival-quiz-setup-schema';

describe('survivalQuizSetupSchema', () => {
    it('accepts EASY, MEDIUM and HARD', () => {
        for (const difficulty of ['EASY', 'MEDIUM', 'HARD'] as const) {
            const parsed = survivalQuizSetupSchema.safeParse({ difficulty });

            expect(parsed.success).toBe(true);
            if (parsed.success) {
                expect(parsed.data.difficulty).toBe(difficulty);
            }
        }
    });

    it('rejects MIXED', () => {
        const parsed = survivalQuizSetupSchema.safeParse({
            difficulty: 'MIXED',
        });

        expect(parsed.success).toBe(false);
    });
});
