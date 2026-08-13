import { z } from 'zod';

import { isMixedQuestionCount } from '@/features/quiz/lib/mixed-difficulty-split';
import type { Difficulty, QuizSetupDifficulty } from '@/features/quiz/types';

/** Option формы старта: три сложности вопроса + MIXED (не Question.difficulty). */
export const quizSetupDifficultySchema = z.enum([
    'EASY',
    'MEDIUM',
    'HARD',
    'MIXED',
]);

/**
 * Настройки Classic (lobby + rematch).
 * MIXED разрешён только на залок-длинах 3/5/10 — иначе нет рецепта сплита.
 */
export const quizSetupSchema = z
    .object({
        difficulty: quizSetupDifficultySchema,
        questionCount: z.coerce
            .number()
            .int('Question count must be an integer')
            .min(1, 'Question count must be at least 1')
            .max(10, 'Question count must be at most 10'),
    })
    .superRefine((value, ctx) => {
        if (
            value.difficulty === 'MIXED' &&
            !isMixedQuestionCount(value.questionCount)
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['questionCount'],
                message: 'Mixed quiz requires 3, 5, or 10 questions',
            });
        }
    });

export type QuizSetupFormInput = z.infer<typeof quizSetupSchema>;

/** Узкий guard: start/cycle всё ещё работают с EASY|MEDIUM|HARD. */
export function isQuestionDifficulty(
    difficulty: QuizSetupDifficulty,
): difficulty is Difficulty {
    return difficulty !== 'MIXED';
}
