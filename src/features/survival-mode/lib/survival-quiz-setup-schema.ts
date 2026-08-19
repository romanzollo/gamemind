/**
 * Zod старта Survival: только EASY|MEDIUM|HARD.
 *
 * Mix в MVP нет — нельзя брать timedQuizSetupSchema (там MIXED легален).
 * questionCount клиент не шлёт: всегда SURVIVAL_MODE_MVP_RULES.questionCount.
 */

import { z } from 'zod';

export const survivalQuizSetupSchema = z.object({
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
});

export type SurvivalQuizSetupFormInput = z.infer<typeof survivalQuizSetupSchema>;
