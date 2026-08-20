/**
 * Zod старта Survival: EASY|MEDIUM|HARD + optional continueRunId.
 *
 * Mix в MVP нет. questionCount клиент не шлёт.
 * continueRunId: следующая волна того же SurvivalRun (не rematch).
 */

import { z } from 'zod';

export const survivalQuizSetupSchema = z.object({
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
    continueRunId: z.string().min(1).optional(),
});

export type SurvivalQuizSetupFormInput = z.infer<typeof survivalQuizSetupSchema>;
