/**
 * Контракт партии фактов «А ты знал?» (`content/drafts/facts/*.json`).
 *
 * Факт — данные, привязанные к метке игры или серии из каталога таксономии,
 * не к вопросу. Длина ограничена: факт живёт в закреплённой плашке под
 * вердиктом, и на телефоне 375 px он не должен занимать больше ~3 строк.
 * Источник обязателен (как у вопросов), но игроку не показывается.
 *
 * Только схема, без fs / pg — её читают CLI `scripts/trivia-facts.ts` и тесты.
 * Canon: docs/DECISIONS.md → Did you know: trivia facts.
 */

import { z } from 'zod';

/** Предел на язык: ≈ 3 строки в плашке ответа на телефоне 375 px. */
export const TRIVIA_FACT_MAX_LENGTH = 180;
/** Короче — уже не факт, а подпись. */
export const TRIVIA_FACT_MIN_LENGTH = 30;
/** Больше за раз — ревью владельца перестаёт быть внимательным. */
export const TRIVIA_FACTS_BATCH_MAX = 300;

/** Измерения, к которым можно привязать факт. Порядок = приоритет показа. */
export const TRIVIA_FACT_FACETS = ['game', 'franchise'] as const;
export type TriviaFactFacet = (typeof TRIVIA_FACT_FACETS)[number];

const CYRILLIC = /[а-яё]/i;

export const triviaFactKeySchema = z
    .string()
    .regex(
        /^fact-[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Key: "fact-<slug>-NN" — a-z, 0-9 and single dashes',
    );

export const triviaFactTagRefSchema = z
    .string()
    .regex(
        /^(game|franchise):[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Tag: "game:<slug>" or "franchise:<slug>" from content/taxonomy/games.json',
    );

const factTextSchema = z
    .string()
    .trim()
    .min(TRIVIA_FACT_MIN_LENGTH)
    .max(TRIVIA_FACT_MAX_LENGTH);

export const draftFactSchema = z
    .object({
        key: triviaFactKeySchema,
        tag: triviaFactTagRefSchema,
        ru: factTextSchema.refine((text) => CYRILLIC.test(text), {
            message: 'RU text must be in Russian',
        }),
        en: factTextSchema.refine((text) => !CYRILLIC.test(text), {
            message: 'EN text must not contain Cyrillic',
        }),
        source: z
            .string()
            .trim()
            .url()
            .refine((url) => url.startsWith('https://'), {
                message: 'Source must be an https:// link',
            }),
    })
    .strict();

export type DraftFact = z.infer<typeof draftFactSchema>;

export const draftFactsBatchSchema = z
    .object({
        version: z.literal(1),
        /** Свободная пометка автора партии (тема, откуда отбор). */
        note: z.string().optional(),
        facts: z.array(draftFactSchema).min(1).max(TRIVIA_FACTS_BATCH_MAX),
    })
    .strict()
    .superRefine((batch, ctx) => {
        const seenKeys = new Map<string, number>();
        const seenRu = new Map<string, number>();
        batch.facts.forEach((fact, index) => {
            const keyAt = seenKeys.get(fact.key);
            if (keyAt !== undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['facts', index, 'key'],
                    message: `Duplicate key (also facts[${keyAt}])`,
                });
            } else {
                seenKeys.set(fact.key, index);
            }

            const ru = fact.ru.toLowerCase();
            const ruAt = seenRu.get(ru);
            if (ruAt !== undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['facts', index, 'ru'],
                    message: `Same RU text as facts[${ruAt}]`,
                });
            } else {
                seenRu.set(ru, index);
            }
        });
    });

export type DraftFactsBatch = z.infer<typeof draftFactsBatchSchema>;
