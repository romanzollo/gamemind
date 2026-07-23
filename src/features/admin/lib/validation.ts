import { z } from 'zod';

// схема для сложности вопроса
const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);

const questionTypeSchema = z.enum(['TEXT', 'IMAGE_GUESS']);

const promptImageUrlSchema = z
    .string()
    .trim()
    .max(2048, 'Image URL is too long')
    .refine(
        (value) =>
            value === '' ||
            value.startsWith('/') ||
            value.startsWith('https://'),
        'Image URL must be a site path or HTTPS URL',
    );

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

function assertImageGuessHasPromptUrl(
    data: { type: z.infer<typeof questionTypeSchema>; promptImageUrl?: string },
    ctx: z.RefinementCtx,
) {
    if (data.type === 'IMAGE_GUESS' && !data.promptImageUrl?.trim()) {
        ctx.addIssue({
            code: 'custom',
            path: ['promptImageUrl'],
            message:
                'Prompt image file or URL is required for image guess questions',
        });
    }
}

/** Метаданные после upload в storage (optional — URL-only путь их не заполняет). */
const promptAssetSchema = z
    .object({
        storageKey: z.string().trim().min(1).max(512),
        mimeType: z.literal('image/webp'),
        width: z.number().int().positive().max(10000),
        height: z.number().int().positive().max(10000),
        byteSize: z.number().int().positive().max(10 * 1024 * 1024),
    })
    .optional();

// схема для создания вопроса
export const createQuestionSchema = z
    .object({
        /** Можно передать сгенерированный id (нужен для storage key до INSERT). */
        id: z.string().trim().min(1).optional(),
        type: questionTypeSchema.default('TEXT'),
        promptImageUrl: promptImageUrlSchema.optional(),
        promptAsset: promptAssetSchema,
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
        assertImageGuessHasPromptUrl(data, ctx);
    });

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

// схема для обновления вопроса
export const updateQuestionSchema = z
    .object({
        questionId: z.string().trim().min(1, 'Question id is required'),
        type: questionTypeSchema.default('TEXT'),
        promptImageUrl: promptImageUrlSchema.optional(),
        promptAsset: promptAssetSchema,
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
        assertImageGuessHasPromptUrl(data, ctx);
    });

export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

// локали для админ-панели
export const adminContentLocales = locales;
