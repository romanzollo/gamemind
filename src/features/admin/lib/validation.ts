import { z } from 'zod';

// схема для сложности вопроса
const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);

// схема для локалей
const locales = ['ru', 'en'] as const;

// схема для перевода текста вопроса
const localizedQuestionTextSchema = z
    .string()
    .trim()
    .min(10, 'Question text must be at least 10 characters')
    .max(500, 'Question text is too long');

// схема для перевода текста варианта ответа
const localizedOptionTextSchema = z
    .string()
    .trim()
    .min(1, 'Option text is required')
    .max(200, 'Option text is too long');

// схема для перевода текста вопроса и вариантов ответа
const questionTranslationsSchema = z.object({
    ru: z.object({ text: localizedQuestionTextSchema }),
    en: z.object({ text: localizedQuestionTextSchema }),
});

// схема для перевода текста вариантов ответа
const answerOptionTranslationsSchema = z.object({
    ru: z.object({ text: localizedOptionTextSchema }),
    en: z.object({ text: localizedOptionTextSchema }),
});

// схема для варианта ответа
const answerOptionSchema = z.object({
    translations: answerOptionTranslationsSchema,
    isCorrect: z.boolean(),
    order: z.number().int().min(0).max(20),
});

// схема для обновления варианта ответа
const answerOptionUpdateSchema = z.object({
    id: z.string().trim().min(1, 'Option id is required'),
    translations: answerOptionTranslationsSchema,
    isCorrect: z.boolean(),
    order: z.number().int().min(0).max(20),
});

// функция для проверки, что в варианте ответа есть ровно один правильный ответ
function assertExactlyOneCorrectOption(
    options: Array<{ isCorrect: boolean }>,
    ctx: z.RefinementCtx,
) {
    const correctCount = options.filter((option) => option.isCorrect).length;

    if (correctCount !== 1) {
        ctx.addIssue({
            code: 'custom',
            path: ['options'],
            message: 'Exactly one correct option is required',
        });
    }
}

// схема для создания вопроса
export const createQuestionSchema = z
    .object({
        translations: questionTranslationsSchema,
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
        assertExactlyOneCorrectOption(data.options, ctx);
    });

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

// схема для обновления вопроса
export const updateQuestionSchema = z
    .object({
        questionId: z.string().trim().min(1, 'Question id is required'),
        translations: questionTranslationsSchema,
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
        assertExactlyOneCorrectOption(data.options, ctx);
    });

export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

// локали для админ-панели
export const adminContentLocales = locales;
