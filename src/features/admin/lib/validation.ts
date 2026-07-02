import { z } from 'zod';

// схема для валидации сложности вопроса
const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);

// схема для валидации варианта ответа
const answerOptionSchema = z.object({
    text: z
        .string()
        .trim()
        .min(1, 'Option text is required')
        .max(200, 'Option text is too long'),
    isCorrect: z.boolean(),
    order: z.number().int().min(0).max(20),
});

// схема для варианта ответа при редактировании (нужен id существующей строки)
const answerOptionUpdateSchema = z.object({
    id: z.string().trim().min(1, 'Option id is required'),
    text: z
        .string()
        .trim()
        .min(1, 'Option text is required')
        .max(200, 'Option text is too long'),
    isCorrect: z.boolean(),
    order: z.number().int().min(0).max(20),
});

// схема для валидации создания вопроса
export const createQuestionSchema = z
    .object({
        text: z
            .string()
            .trim()
            .min(10, 'Question text must be at least 10 characters')
            .max(500, 'Question text is too long'),
        difficulty: difficultySchema,
        category: z
            .string()
            .trim()
            .min(1, 'Category is required')
            .max(100, 'Category is too long')
            .default('video-games'),
        options: z
            .array(answerOptionSchema)
            .min(2, 'At least 2 options are required')
            .max(6, 'At most 6 options are allowed'),
    })
    .superRefine((data, ctx) => {
        const correctCount = data.options.filter(
            (option) => option.isCorrect,
        ).length;

        if (correctCount !== 1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['options'],
                message: 'Exactly one correct option is required',
            });
        }
    });

// тип для ввода создания вопроса
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

// схема для валидации редактирования вопроса
export const updateQuestionSchema = z
    .object({
        questionId: z.string().trim().min(1, 'Question id is required'),
        text: z
            .string()
            .trim()
            .min(10, 'Question text must be at least 10 characters')
            .max(500, 'Question text is too long'),
        difficulty: difficultySchema,
        category: z
            .string()
            .trim()
            .min(1, 'Category is required')
            .max(100, 'Category is too long')
            .default('video-games'),
        options: z
            .array(answerOptionUpdateSchema)
            .min(2, 'At least 2 options are required')
            .max(6, 'At most 6 options are allowed'),
    })
    .superRefine((data, ctx) => {
        const correctCount = data.options.filter(
            (option) => option.isCorrect,
        ).length;

        if (correctCount !== 1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['options'],
                message: 'Exactly one correct option is required',
            });
        }
    });

// тип для ввода редактирования вопроса
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
