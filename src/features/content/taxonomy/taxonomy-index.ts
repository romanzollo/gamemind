/**
 * Каталог таксономии → строки справочников и метки вопроса.
 *
 * Метки вопроса выводятся из его игры: `game:portal` даёт метку игры, её
 * серию, эпоху по году, платформы и жанры. Вопрос о серии целиком получает
 * только серию. Чистые функции: sync-скрипт пишет их результат в БД, тесты
 * проверяют вывод без Neon.
 *
 * Canon: docs/DECISIONS.md → Content taxonomy.
 */

import {
    GAME_FACET_SLUGS,
    normalizeCatalogName,
    type CatalogGame,
    type GameFacetSlug,
    type TaxonomyCatalog,
} from './taxonomy-catalog.schema';

export type FacetRow = {
    id: string;
    domainId: string;
    slug: GameFacetSlug;
    nameRu: string;
    nameEn: string;
    sortOrder: number;
};

export type TagRow = {
    id: string;
    facetId: string;
    slug: string;
    nameRu: string;
    nameEn: string;
    parentId: string | null;
    sortOrder: number;
};

export type TaxonomyIndex = {
    domain: { id: string; nameRu: string; nameEn: string };
    facets: FacetRow[];
    /** Порядок: родители раньше детей — вставка без нарушения FK. */
    tags: TagRow[];
    tagIdsByRef: ReadonlyMap<string, string>;
    gamesBySlug: ReadonlyMap<string, CatalogGame>;
    gameSlugByName: ReadonlyMap<string, string>;
    franchiseSlugBySeriesName: ReadonlyMap<string, string>;
    eraSlugForYear: (year: number) => string | null;
};

/** Откуда взялись метки вопроса — для отчёта sync. */
export type QuestionTagSource = 'override' | 'draft-tags' | 'game' | 'none';

export type QuestionTagInput = {
    /** Ручные метки из question-overrides.json. */
    override?: readonly string[];
    /** Поле `tags` черновика. */
    draftTags?: readonly string[];
    /** Кандидаты в название игры по приоритету: черновик, затем БД. */
    gameNames: ReadonlyArray<string | null | undefined>;
};

export type QuestionTagResult = {
    source: QuestionTagSource;
    tagIds: string[];
    /** Ссылки, которых нет в каталоге (`platform:ps9`). */
    unknownRefs: string[];
    /** Название игры, которое каталог не знает. */
    unknownGameName: string | null;
};

export function tagIdOf(
    domainId: string,
    facet: GameFacetSlug,
    slug: string,
): string {
    return `${domainId}.${facet}.${slug}`;
}

export function buildTaxonomyIndex(catalog: TaxonomyCatalog): TaxonomyIndex {
    const domainId = catalog.domain.id;
    const facetId = (facet: GameFacetSlug) => `${domainId}.${facet}`;

    const facets: FacetRow[] = GAME_FACET_SLUGS.map((slug, sortOrder) => {
        const facet = catalog.facets.find((item) => item.slug === slug);
        return {
            id: facetId(slug),
            domainId,
            slug,
            nameRu: facet?.ru ?? slug,
            nameEn: facet?.en ?? slug,
            sortOrder,
        };
    });

    const tags: TagRow[] = [];
    const tagIdsByRef = new Map<string, string>();
    const addTag = (
        facet: GameFacetSlug,
        slug: string,
        nameRu: string,
        nameEn: string,
        parentSlug: string | null,
        sortOrder: number,
    ) => {
        const id = tagIdOf(domainId, facet, slug);
        tags.push({
            id,
            facetId: facetId(facet),
            slug,
            nameRu,
            nameEn,
            parentId: parentSlug ? tagIdOf(domainId, facet, parentSlug) : null,
            sortOrder,
        });
        tagIdsByRef.set(`${facet}:${slug}`, id);
    };

    // Семейства платформ — первыми: дети ссылаются на них по FK.
    const families = catalog.platforms.filter((platform) => !platform.parent);
    const leaves = catalog.platforms.filter((platform) => platform.parent);
    [...families, ...leaves].forEach((platform) =>
        addTag(
            'platform',
            platform.slug,
            platform.ru,
            platform.en,
            platform.parent ?? null,
            catalog.platforms.indexOf(platform),
        ),
    );
    catalog.eras.forEach((era, index) =>
        addTag('era', era.slug, era.ru, era.en, null, index),
    );
    catalog.genres.forEach((genre, index) =>
        addTag('genre', genre.slug, genre.ru, genre.en, null, index),
    );
    catalog.franchises.forEach((franchise, index) =>
        addTag(
            'franchise',
            franchise.slug,
            franchise.ru ?? franchise.name,
            franchise.name,
            null,
            index,
        ),
    );
    catalog.games.forEach((game, index) =>
        addTag(
            'game',
            game.slug,
            game.ru ?? game.title,
            game.title,
            null,
            index,
        ),
    );

    const gamesBySlug = new Map(catalog.games.map((game) => [game.slug, game]));
    const gameSlugByName = new Map<string, string>();
    for (const game of catalog.games) {
        for (const name of [game.title, ...(game.aliases ?? [])]) {
            gameSlugByName.set(normalizeCatalogName(name), game.slug);
        }
    }
    const franchiseSlugBySeriesName = new Map(
        Object.entries(catalog.seriesAliases).map(([name, slug]) => [
            normalizeCatalogName(name),
            slug,
        ]),
    );

    return {
        domain: {
            id: domainId,
            nameRu: catalog.domain.ru,
            nameEn: catalog.domain.en,
        },
        facets,
        tags,
        tagIdsByRef,
        gamesBySlug,
        gameSlugByName,
        franchiseSlugBySeriesName,
        eraSlugForYear: (year) =>
            catalog.eras.find((era) => year >= era.from && year <= era.to)
                ?.slug ?? null,
    };
}

/**
 * Ссылки → id меток. `game:x` раскрывается в игру, серию, эпоху, платформы
 * и жанры; остальные ссылки — ровно одна метка.
 */
export function expandTagRefs(
    index: TaxonomyIndex,
    refs: readonly string[],
): { tagIds: string[]; unknownRefs: string[] } {
    const expanded: string[] = [];
    const unknownRefs: string[] = [];

    for (const ref of refs) {
        const tagId = index.tagIdsByRef.get(ref);
        if (!tagId) {
            unknownRefs.push(ref);
            continue;
        }
        expanded.push(ref);

        if (!ref.startsWith('game:')) {
            continue;
        }
        const game = index.gamesBySlug.get(ref.slice('game:'.length));
        if (!game) {
            continue;
        }
        if (game.franchise) {
            expanded.push(`franchise:${game.franchise}`);
        }
        const era = index.eraSlugForYear(game.year);
        if (era) {
            expanded.push(`era:${era}`);
        }
        expanded.push(...game.platforms.map((slug) => `platform:${slug}`));
        expanded.push(...game.genres.map((slug) => `genre:${slug}`));
    }

    const tagIds = [
        ...new Set(
            expanded
                .map((ref) => index.tagIdsByRef.get(ref))
                .filter((id): id is string => id !== undefined),
        ),
    ];

    return { tagIds, unknownRefs };
}

/** Название игры из черновика / metadata → ссылка на игру или серию. */
export function refForGameName(
    index: TaxonomyIndex,
    name: string,
): string | null {
    const key = normalizeCatalogName(name);
    const game = index.gameSlugByName.get(key);
    if (game) {
        return `game:${game}`;
    }
    const franchise = index.franchiseSlugBySeriesName.get(key);
    return franchise ? `franchise:${franchise}` : null;
}

/**
 * Метки одного вопроса. Первое, что есть, побеждает: ручные метки →
 * `tags` черновика → игра из черновика / БД.
 */
export function deriveQuestionTags(
    index: TaxonomyIndex,
    input: QuestionTagInput,
): QuestionTagResult {
    if (input.override && input.override.length > 0) {
        return {
            source: 'override',
            ...expandTagRefs(index, input.override),
            unknownGameName: null,
        };
    }
    if (input.draftTags && input.draftTags.length > 0) {
        return {
            source: 'draft-tags',
            ...expandTagRefs(index, input.draftTags),
            unknownGameName: null,
        };
    }

    const gameName = input.gameNames.find(
        (name): name is string =>
            typeof name === 'string' && name.trim() !== '',
    );
    if (!gameName) {
        return {
            source: 'none',
            tagIds: [],
            unknownRefs: [],
            unknownGameName: null,
        };
    }

    const ref = refForGameName(index, gameName);
    if (!ref) {
        return {
            source: 'none',
            tagIds: [],
            unknownRefs: [],
            unknownGameName: gameName,
        };
    }

    return {
        source: 'game',
        ...expandTagRefs(index, [ref]),
        unknownGameName: null,
    };
}
