/**
 * Zod-контракт каталога таксономии (`content/taxonomy/*.json`).
 *
 * Каталог — источник правды для справочников Domain / Facet / Tag и для
 * фактов об играх (год, платформы, жанры, серия). Метки вопроса выводятся
 * из его игры (`taxonomy-index.ts`), поэтому факты живут здесь один раз.
 * Без Prisma/pg: только форма данных и перекрёстные ссылки.
 *
 * Canon: docs/DECISIONS.md → Content taxonomy.
 */

import { z } from 'zod';

/** Измерения домена игр. Порядок = порядок в админке и фильтрах. */
export const GAME_FACET_SLUGS = [
    'platform',
    'era',
    'genre',
    'franchise',
    'game',
] as const;

export type GameFacetSlug = (typeof GAME_FACET_SLUGS)[number];

const slugSchema = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug: a-z, 0-9 and single dashes');

const nameSchema = z.string().trim().min(1).max(120);

/** Ссылка на метку в каталоге и в черновиках: `platform:ps2`, `game:portal`. */
export const tagRefSchema = z
    .string()
    .regex(
        /^(platform|era|genre|franchise|game):[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Tag ref: "<facet>:<slug>", e.g. "platform:ps2"',
    );

export type TagRef = z.infer<typeof tagRefSchema>;

const namedTagSchema = z.object({
    slug: slugSchema,
    ru: nameSchema,
    en: nameSchema,
});

const gameSchema = z.object({
    slug: slugSchema,
    title: nameSchema,
    /** Название в RU-интерфейсе, если отличается от оригинального. */
    ru: nameSchema.optional(),
    /** Год полноценного релиза (1.0); вечный ранний доступ — год его старта. */
    year: z.number().int().min(1950).max(2100),
    /** Платформы первого года после релиза: без поздних портов и ремастеров. */
    platforms: z.array(slugSchema),
    genres: z.array(slugSchema).min(1).max(3),
    franchise: slugSchema.optional(),
    /** Написания из черновиков и `metadata.game` (`Baldur’s Gate 3`). */
    aliases: z.array(nameSchema).optional(),
});

export type CatalogGame = z.infer<typeof gameSchema>;

export const taxonomyCatalogSchema = z
    .object({
        version: z.literal(1),
        domain: z.object({ id: slugSchema, ru: nameSchema, en: nameSchema }),
        facets: z.array(
            z.object({
                slug: z.enum(GAME_FACET_SLUGS),
                ru: nameSchema,
                en: nameSchema,
            }),
        ),
        /** parent — семейство в том же измерении (PS2 → PlayStation). */
        platforms: z.array(
            namedTagSchema.extend({ parent: slugSchema.optional() }),
        ),
        eras: z.array(
            namedTagSchema.extend({
                from: z.number().int(),
                to: z.number().int(),
            }),
        ),
        genres: z.array(namedTagSchema),
        franchises: z.array(
            z.object({
                slug: slugSchema,
                name: nameSchema,
                ru: nameSchema.optional(),
            }),
        ),
        games: z.array(gameSchema),
        /**
         * Названия серий, которые черновики пишут в `metadata.game`
         * («Civilization», «Hitman»): вопрос получает только метку серии.
         */
        seriesAliases: z.record(nameSchema, slugSchema),
    })
    .superRefine((catalog, ctx) => {
        const facetSlugs = new Set(catalog.facets.map((facet) => facet.slug));
        for (const slug of GAME_FACET_SLUGS) {
            if (!facetSlugs.has(slug)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['facets'],
                    message: `Missing facet "${slug}"`,
                });
            }
        }

        const platformSlugs = uniqueSlugs(catalog.platforms, 'platforms', ctx);
        const genreSlugs = uniqueSlugs(catalog.genres, 'genres', ctx);
        const franchiseSlugs = uniqueSlugs(
            catalog.franchises,
            'franchises',
            ctx,
        );
        uniqueSlugs(catalog.eras, 'eras', ctx);
        uniqueSlugs(catalog.games, 'games', ctx);

        catalog.platforms.forEach((platform, index) => {
            if (platform.parent && !platformSlugs.has(platform.parent)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['platforms', index, 'parent'],
                    message: `Unknown parent platform "${platform.parent}"`,
                });
            }
        });

        const aliasOwner = new Map<string, string>();
        catalog.games.forEach((game, index) => {
            const path = ['games', index];
            for (const platform of game.platforms) {
                if (!platformSlugs.has(platform)) {
                    ctx.addIssue({
                        code: 'custom',
                        path: [...path, 'platforms'],
                        message: `${game.slug}: unknown platform "${platform}"`,
                    });
                }
            }
            for (const genre of game.genres) {
                if (!genreSlugs.has(genre)) {
                    ctx.addIssue({
                        code: 'custom',
                        path: [...path, 'genres'],
                        message: `${game.slug}: unknown genre "${genre}"`,
                    });
                }
            }
            if (game.franchise && !franchiseSlugs.has(game.franchise)) {
                ctx.addIssue({
                    code: 'custom',
                    path: [...path, 'franchise'],
                    message: `${game.slug}: unknown franchise "${game.franchise}"`,
                });
            }
            if (
                !catalog.eras.some(
                    (era) => game.year >= era.from && game.year <= era.to,
                )
            ) {
                ctx.addIssue({
                    code: 'custom',
                    path: [...path, 'year'],
                    message: `${game.slug}: no era covers ${game.year}`,
                });
            }
            for (const name of [game.title, ...(game.aliases ?? [])]) {
                const key = normalizeCatalogName(name);
                const owner = aliasOwner.get(key);
                if (owner && owner !== game.slug) {
                    ctx.addIssue({
                        code: 'custom',
                        path: [...path, 'aliases'],
                        message: `"${name}" names both ${owner} and ${game.slug}`,
                    });
                }
                aliasOwner.set(key, game.slug);
            }
        });

        for (const [name, franchise] of Object.entries(catalog.seriesAliases)) {
            if (!franchiseSlugs.has(franchise)) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['seriesAliases', name],
                    message: `Unknown franchise "${franchise}"`,
                });
            }
            if (aliasOwner.has(normalizeCatalogName(name))) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['seriesAliases', name],
                    message: `"${name}" is also a game title or alias`,
                });
            }
        }
    });

export type TaxonomyCatalog = z.infer<typeof taxonomyCatalogSchema>;

/**
 * Ручные метки вопросов по `contentKey`: вопросы о серии целиком, о железе
 * и истории индустрии, вопросы без игры. Заменяют выведенный набор.
 */
export const questionOverridesSchema = z.object({
    version: z.literal(1),
    questions: z.record(z.string().min(1), z.array(tagRefSchema).min(1)),
});

export type QuestionOverrides = z.infer<typeof questionOverridesSchema>;

/**
 * Сравнение названий игр без учёта регистра, типографских кавычек и
 * пробелов: черновики пишут и `Baldur's Gate 3`, и `Baldur’s Gate 3`.
 */
export function normalizeCatalogName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[’‘`]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function uniqueSlugs(
    items: ReadonlyArray<{ slug: string }>,
    path: string,
    ctx: z.RefinementCtx,
): Set<string> {
    const seen = new Set<string>();
    items.forEach((item, index) => {
        if (seen.has(item.slug)) {
            ctx.addIssue({
                code: 'custom',
                path: [path, index, 'slug'],
                message: `Duplicate slug "${item.slug}"`,
            });
        }
        seen.add(item.slug);
    });
    return seen;
}
