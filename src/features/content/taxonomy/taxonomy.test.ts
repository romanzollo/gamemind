import { describe, expect, it } from 'vitest';

import {
    buildDraftTextIndex,
    buildTaxonomyIndex,
    deriveQuestionTags,
    expandTagRefs,
    planTaxonomySync,
    resolveContentKey,
    taxonomyCatalogSchema,
    type SyncQuestionRow,
    type TaxonomyCatalog,
} from '.';
import {
    loadQuestionOverrides,
    loadTaxonomyCatalog,
} from './load-taxonomy-files';

const catalog: TaxonomyCatalog = {
    version: 1,
    domain: { id: 'games', ru: 'Игры', en: 'Games' },
    facets: [
        { slug: 'platform', ru: 'Платформа', en: 'Platform' },
        { slug: 'era', ru: 'Эпоха', en: 'Era' },
        { slug: 'genre', ru: 'Жанр', en: 'Genre' },
        { slug: 'franchise', ru: 'Серия', en: 'Series' },
        { slug: 'game', ru: 'Игра', en: 'Game' },
    ],
    platforms: [
        { slug: 'pc', ru: 'ПК', en: 'PC' },
        { slug: 'ps2', ru: 'PS2', en: 'PS2', parent: 'playstation' },
        { slug: 'playstation', ru: 'PlayStation', en: 'PlayStation' },
    ],
    eras: [
        { slug: '1990s', ru: '90-е', en: '1990s', from: 1990, to: 1999 },
        { slug: '2000s', ru: '2000-е', en: '2000s', from: 2000, to: 2009 },
    ],
    genres: [
        { slug: 'shooter', ru: 'Шутеры', en: 'Shooters' },
        { slug: 'stealth', ru: 'Стелс', en: 'Stealth' },
    ],
    franchises: [
        { slug: 'half-life', name: 'Half-Life' },
        { slug: 'hitman', name: 'Hitman' },
    ],
    games: [
        {
            slug: 'half-life-2',
            title: 'Half-Life 2',
            year: 2004,
            platforms: ['pc'],
            genres: ['shooter'],
            franchise: 'half-life',
        },
        {
            slug: 'hitman-blood-money',
            title: 'Hitman: Blood Money',
            year: 2006,
            platforms: ['pc', 'ps2'],
            genres: ['stealth'],
            franchise: 'hitman',
            aliases: ['Hitman Blood Money'],
        },
    ],
    seriesAliases: { Hitman: 'hitman' },
    playTopics: ['era:2000s', 'platform:playstation'],
};

const index = buildTaxonomyIndex(catalog);

describe('taxonomy catalog', () => {
    it('accepts the catalog and overrides in content/taxonomy', () => {
        const real = loadTaxonomyCatalog(process.cwd());
        const realIndex = buildTaxonomyIndex(real);
        const overrides = loadQuestionOverrides(process.cwd());

        for (const [key, refs] of Object.entries(overrides.questions)) {
            expect(expandTagRefs(realIndex, refs).unknownRefs, key).toEqual([]);
        }
    });

    it('rejects a game with an unknown platform or a year no era covers', () => {
        const broken = {
            ...catalog,
            games: [{ ...catalog.games[0], platforms: ['ps9'], year: 2015 }],
        };
        const result = taxonomyCatalogSchema.safeParse(broken);

        expect(result.success).toBe(false);
        expect(result.error?.issues.map((issue) => issue.message)).toEqual(
            expect.arrayContaining([
                'half-life-2: unknown platform "ps9"',
                'half-life-2: no era covers 2015',
            ]),
        );
    });

    it('rejects a name that points at two games', () => {
        const broken = {
            ...catalog,
            games: [
                ...catalog.games,
                {
                    ...catalog.games[0],
                    slug: 'hl2-copy',
                    aliases: ['Half-Life 2'],
                },
            ],
        };

        expect(taxonomyCatalogSchema.safeParse(broken).success).toBe(false);
    });

    it('rejects an unknown or repeated play topic', () => {
        const broken = {
            ...catalog,
            playTopics: ['era:2000s', 'genre:racing', 'era:2000s'],
        };
        const result = taxonomyCatalogSchema.safeParse(broken);

        expect(result.error?.issues.map((issue) => issue.message)).toEqual([
            'Unknown play topic "genre:racing"',
            'Duplicate play topic "era:2000s"',
        ]);
    });

    it('numbers play topics in catalog order and leaves other tags out', () => {
        const playOrder = (id: string) =>
            index.tags.find((tag) => tag.id === id)?.playOrder;

        expect(playOrder('games.era.2000s')).toBe(0);
        expect(playOrder('games.platform.playstation')).toBe(1);
        expect(playOrder('games.platform.ps2')).toBeNull();
    });

    it('puts platform families before their children and keeps ids stable', () => {
        const ids = index.tags.map((tag) => tag.id);

        expect(ids.indexOf('games.platform.playstation')).toBeLessThan(
            ids.indexOf('games.platform.ps2'),
        );
        expect(
            index.tags.find((tag) => tag.id === 'games.platform.ps2')?.parentId,
        ).toBe('games.platform.playstation');
    });
});

describe('deriveQuestionTags', () => {
    it('expands a game into series, era, platforms and genres', () => {
        const result = deriveQuestionTags(index, {
            gameNames: ['Hitman: Blood Money'],
        });

        expect(result.source).toBe('game');
        expect(result.tagIds.sort()).toEqual(
            [
                'games.game.hitman-blood-money',
                'games.franchise.hitman',
                'games.era.2000s',
                'games.platform.pc',
                'games.platform.ps2',
                'games.genre.stealth',
            ].sort(),
        );
    });

    it('matches spellings regardless of case and typographic quotes', () => {
        expect(
            deriveQuestionTags(index, { gameNames: ['HALF-LIFE 2'] }).tagIds,
        ).toContain('games.game.half-life-2');
    });

    it('gives a series-level name only the series tag', () => {
        expect(
            deriveQuestionTags(index, { gameNames: ['Hitman'] }).tagIds,
        ).toEqual(['games.franchise.hitman']);
    });

    it('prefers the override, then draft tags, then the game', () => {
        const result = deriveQuestionTags(index, {
            override: ['franchise:half-life'],
            draftTags: ['genre:shooter'],
            gameNames: ['Hitman: Blood Money'],
        });

        expect(result.source).toBe('override');
        expect(result.tagIds).toEqual(['games.franchise.half-life']);
        expect(
            deriveQuestionTags(index, {
                draftTags: ['genre:shooter'],
                gameNames: ['Hitman: Blood Money'],
            }).tagIds,
        ).toEqual(['games.genre.shooter']);
    });

    it('takes the first known game name: the draft wins over the database', () => {
        const result = deriveQuestionTags(index, {
            gameNames: [undefined, 'Half-Life 2'],
        });

        expect(result.tagIds).toContain('games.game.half-life-2');
    });

    it('reports an unknown game and unknown refs instead of guessing', () => {
        expect(
            deriveQuestionTags(index, { gameNames: ['Half-Life 3'] }),
        ).toMatchObject({
            source: 'none',
            tagIds: [],
            unknownGameName: 'Half-Life 3',
        });
        expect(expandTagRefs(index, ['platform:ps9']).unknownRefs).toEqual([
            'platform:ps9',
        ]);
    });
});

describe('resolveContentKey', () => {
    const drafts = buildDraftTextIndex(
        [
            {
                questions: [
                    {
                        draftKey: 'draft-gordon',
                        type: 'TEXT',
                        translations: {
                            ru: { text: 'Как зовут героя Half-Life?' },
                        },
                    },
                    {
                        draftKey: 'draft-image',
                        type: 'IMAGE_GUESS',
                        translations: {
                            ru: { text: 'Угадай игру по изображению.' },
                        },
                    },
                ],
            },
        ],
        [
            {
                fixes: [
                    {
                        matchQuestionRu: 'Как зовут героя Half-Life?',
                        question: {
                            ru: 'Как зовут учёного — героя Half-Life?',
                        },
                    },
                ],
            },
        ],
    );
    const uuid = '0e2d6b42-8556-4cf8-8d43-db5766838fd9';

    it('keeps a deterministic id: seed and image ids are the same on dev and prod', () => {
        expect(
            resolveContentKey(
                {
                    id: 'q-vg-easy-004',
                    type: 'TEXT',
                    metadataDraftKey: null,
                    ruText: null,
                },
                drafts,
            ),
        ).toEqual({ key: 'q-vg-easy-004', source: 'id' });
    });

    it('uses metadata.draftKey, then the RU text, then the fix chain', () => {
        expect(
            resolveContentKey(
                {
                    id: uuid,
                    type: 'TEXT',
                    metadataDraftKey: 'from-meta',
                    ruText: null,
                },
                drafts,
            ),
        ).toEqual({ key: 'from-meta', source: 'metadata' });
        expect(
            resolveContentKey(
                {
                    id: uuid,
                    type: 'TEXT',
                    metadataDraftKey: null,
                    ruText: '  как зовут героя   Half-Life? ',
                },
                drafts,
            ),
        ).toEqual({ key: 'draft-gordon', source: 'text' });
        expect(
            resolveContentKey(
                {
                    id: uuid,
                    type: 'TEXT',
                    metadataDraftKey: null,
                    ruText: 'Как зовут учёного — героя Half-Life?',
                },
                drafts,
            ),
        ).toEqual({ key: 'draft-gordon', source: 'fix-chain' });
    });

    it('never matches images by text: they all share one stem', () => {
        expect(
            resolveContentKey(
                {
                    id: uuid,
                    type: 'IMAGE_GUESS',
                    metadataDraftKey: null,
                    ruText: 'Угадай игру по изображению.',
                },
                drafts,
            ),
        ).toBeNull();
    });
});

describe('planTaxonomySync', () => {
    const question = (patch: Partial<SyncQuestionRow>): SyncQuestionRow => ({
        id: 'q-1',
        type: 'TEXT',
        publicationStatus: 'PUBLISHED',
        isActive: true,
        contentKey: null,
        metadata: null,
        ruText: null,
        ...patch,
    });
    const drafts = buildDraftTextIndex(
        [
            {
                questions: [
                    {
                        draftKey: 'hl2',
                        type: 'TEXT',
                        translations: {
                            ru: { text: 'Вопрос про Half-Life 2' },
                        },
                    },
                ],
            },
        ],
        [],
    );
    const base = {
        index,
        overrides: { version: 1 as const, questions: {} },
        draftsByKey: new Map([['hl2', { metadata: { game: 'Half-Life 2' } }]]),
        draftText: drafts,
        existingTags: [],
        existingLinks: [],
        prune: false,
    };

    it('sets the content key and links the tags derived from the draft game', () => {
        const plan = planTaxonomySync({
            ...base,
            questions: [
                question({
                    id: '0e2d6b42-8556-4cf8-8d43-db5766838fd9',
                    ruText: 'Вопрос про Half-Life 2',
                }),
            ],
        });

        expect(plan.contentKeys).toEqual([
            {
                questionId: '0e2d6b42-8556-4cf8-8d43-db5766838fd9',
                contentKey: 'hl2',
                source: 'text',
            },
        ]);
        expect(plan.linksToAdd.map((link) => link.tagId)).toContain(
            'games.game.half-life-2',
        );
        expect(plan.tagUpserts).toHaveLength(index.tags.length);
    });

    it('writes no key that two questions would share', () => {
        const plan = planTaxonomySync({
            ...base,
            questions: [
                question({
                    id: '0e2d6b42-8556-4cf8-8d43-db5766838fd9',
                    ruText: 'Вопрос про Half-Life 2',
                }),
                question({
                    id: '105c0db3-7677-4c65-a331-c09cb2f3d6bd',
                    ruText: 'Вопрос про Half-Life 2',
                }),
            ],
        });

        expect(plan.contentKeys).toEqual([]);
        expect(plan.report.duplicateKeys).toEqual(['hl2']);
    });

    it('keeps links the catalog does not give unless prune is on', () => {
        const input = {
            ...base,
            questions: [question({ id: 'q-1', contentKey: 'hl2' })],
            existingLinks: [
                { questionId: 'q-1', tagId: 'games.genre.stealth' },
            ],
        };

        expect(planTaxonomySync(input).linksToRemove).toEqual([]);
        expect(
            planTaxonomySync({ ...input, prune: true }).linksToRemove,
        ).toEqual([{ questionId: 'q-1', tagId: 'games.genre.stealth' }]);
    });

    it('lists published questions the catalog could not tag', () => {
        const plan = planTaxonomySync({
            ...base,
            questions: [question({ id: 'q-2', contentKey: 'unknown' })],
        });

        expect(plan.report.untaggedPublished).toEqual([
            { id: 'q-2', contentKey: 'unknown' },
        ]);
    });
});
