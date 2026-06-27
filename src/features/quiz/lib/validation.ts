import { z } from 'zod';

// схема для валидации настроек викторины
export const quizSetupSchema = z.object({
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
    questionCount: z.coerce
        .number()
        .int('Question count must be an integer')
        .min(1, 'Question count must be at least 1')
        .max(10, 'Question count must be at most 10'),
});

// тип для входных данных для формы настройки викторины
export type QuizSetupFormInput = z.infer<typeof quizSetupSchema>;
