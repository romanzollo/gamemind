/**
 * Zod-контракт пакета draft-вопросов v1.
 *
 * Зачем: один источник правды для validate/import — рядом с
 * `content/drafts/schema/draft-questions.v1.schema.json` и docs/CONTENT_PIPELINE.md.
 * Без Prisma/pg: только форма данных до записи в БД.
 *
 * Строже admin create по options: ровно 4 (не 2–6). type только TEXT.
 * Длины текстов совпадают с admin validation — чтобы import потом прошёл createSchema.
 */

import { z } from 'zod';

const localizedQuestionTextSchema = z
    .string()
    .trim()
    .min(10, 'Question text must be at least 10 characters')
    .max(500, 'Question text is too long');

const localizedOptionTextSchema = z
    .string()
    .trim()
    .min(1, 'Option text is required')
    .max(200, 'Option text is too long');

const bilingualTextsSchema = z.object({
    ru: z.object({ text: localizedQuestionTextSchema }),
    en: z.object({ text: localizedQuestionTextSchema }),
});

const bilingualOptionTextsSchema = z.object({
    ru: z.object({ text: localizedOptionTextSchema }),
    en: z.object({ text: localizedOptionTextSchema }),
});

const draftOptionSchema = z.object({
    isCorrect: z.boolean(),
    translations: bilingualOptionTextsSchema,
});

const draftQuestionSchema = z.object({
    draftKey: z.string().trim().min(1).max(120).optional(),
    type: z.literal('TEXT'),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
    category: z.string().trim().min(1).max(100).optional(),
    metadata: z.record(z.unknown()).optional(),
    translations: bilingualTextsSchema,
    options: z.array(draftOptionSchema).length(4, 'Exactly 4 options are required'),
});

function assertExactlyOneCorrectOption(
    options: Array<{ isCorrect: boolean }>,
    ctx: z.RefinementCtx,
    pathPrefix: (string | number)[],
) {
    const correctCount = options.filter((option) => option.isCorrect).length;

    if (correctCount !== 1) {
        ctx.addIssue({
            code: 'custom',
            path: [...pathPrefix, 'options'],
            message: 'Exactly one correct option is required',
        });
    }
}

/**
 * Корень файла: version + questions[].
 * Дубликат draftKey внутри пакета — ошибка формы (не publish gate).
 */
export const draftQuestionsBatchSchema = z
    .object({
        version: z.literal(1),
        source: z.enum(['manual', 'ai', 'api', 'template']).optional(),
        questions: z.array(draftQuestionSchema).min(1, 'At least one question is required'),
    })
    .superRefine((batch, ctx) => {
        const seenKeys = new Set<string>();

        batch.questions.forEach((question, index) => {
            assertExactlyOneCorrectOption(question.options, ctx, [
                'questions',
                index,
            ]);

            const key = question.draftKey?.trim();
            if (!key) {
                return;
            }

            if (seenKeys.has(key)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['questions', index, 'draftKey'],
                    message: `Duplicate draftKey: ${key}`,
                });
                return;
            }

            seenKeys.add(key);
        });
    });

export type DraftQuestionsBatch = z.infer<typeof draftQuestionsBatchSchema>;
export type DraftQuestion = DraftQuestionsBatch['questions'][number];
