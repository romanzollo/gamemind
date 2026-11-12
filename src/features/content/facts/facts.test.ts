import { describe, expect, it } from 'vitest';

import { buildTaxonomyIndex } from '../taxonomy';
import { loadTaxonomyCatalog } from '../taxonomy/load-taxonomy-files';
import {
    TRIVIA_FACT_MAX_LENGTH,
    findFactAnswerHints,
    normalizeForHint,
    validateDraftFactsBatch,
    type FactHintQuestion,
} from '.';

const index = buildTaxonomyIndex(loadTaxonomyCatalog(process.cwd()));

const goodFact = {
    key: 'fact-half-life-2-01',
    tag: 'game:half-life-2',
    ru: 'В октябре 2003 года исходный код Half-Life 2 украли и выложили в сеть.',
    en: 'In October 2003 the Half-Life 2 source code was stolen and leaked online.',
    source: 'https://en.wikipedia.org/wiki/Half-Life_2',
};

function batchOf(...facts: object[]) {
    return { version: 1, facts };
}

describe('validateDraftFactsBatch', () => {
    it('accepts a game fact and a series fact and resolves tag ids', () => {
        const result = validateDraftFactsBatch(
            batchOf(goodFact, {
                ...goodFact,
                key: 'fact-resident-evil-01',
                tag: 'franchise:resident-evil',
                ru: 'В Японии серия называется Biohazard, а не Resident Evil.',
            }),
            index,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.facts.map((fact) => fact.tagId)).toEqual([
            'games.game.half-life-2',
            'games.franchise.resident-evil',
        ]);
        expect(result.warnings).toEqual([]);
    });

    it('rejects a tag that is not in the catalog', () => {
        const result = validateDraftFactsBatch(
            batchOf({ ...goodFact, tag: 'game:no-such-game' }),
            index,
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.issues[0]?.path).toBe('facts[0].tag');
    });

    it('rejects facets other than game and series', () => {
        const result = validateDraftFactsBatch(
            batchOf({ ...goodFact, tag: 'platform:pc' }),
            index,
        );
        expect(result.ok).toBe(false);
    });

    it('rejects text longer than the sheet allows', () => {
        const result = validateDraftFactsBatch(
            batchOf({
                ...goodFact,
                ru: `${'а'.repeat(TRIVIA_FACT_MAX_LENGTH)}.`,
            }),
            index,
        );
        expect(result.ok).toBe(false);
    });

    it('rejects Cyrillic in EN, Latin-only RU and a non-https source', () => {
        for (const broken of [
            { ...goodFact, en: goodFact.ru },
            { ...goodFact, ru: goodFact.en },
            { ...goodFact, source: 'http://example.com/page' },
        ]) {
            expect(validateDraftFactsBatch(batchOf(broken), index).ok).toBe(
                false,
            );
        }
    });

    it('rejects duplicate keys and duplicate RU text', () => {
        const dupKey = validateDraftFactsBatch(
            batchOf(goodFact, { ...goodFact, ru: `${goodFact.ru} Ещё.` }),
            index,
        );
        const dupText = validateDraftFactsBatch(
            batchOf(goodFact, { ...goodFact, key: 'fact-half-life-2-02' }),
            index,
        );
        expect(dupKey.ok).toBe(false);
        expect(dupText.ok).toBe(false);
    });

    it('warns when a text has no full stop', () => {
        const result = validateDraftFactsBatch(
            batchOf({ ...goodFact, en: goodFact.en.slice(0, -1) }),
            index,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.warnings).toHaveLength(1);
    });

    it('rejects unknown fields (typos like "souce")', () => {
        const result = validateDraftFactsBatch(
            batchOf({ ...goodFact, souce: 'https://example.com' }),
            index,
        );
        expect(result.ok).toBe(false);
    });
});

describe('findFactAnswerHints', () => {
    const gwent: FactHintQuestion = {
        ref: 'q-witcher-gwent',
        textRu: 'Как называется карточная игра в «Ведьмаке 3»?',
        answers: ['Гвинт', 'Gwent'],
    };
    const year: FactHintQuestion = {
        ref: 'q-witcher-year',
        textRu: 'В каком году вышел «Ведьмак 3»?',
        answers: ['2015'],
    };
    const short: FactHintQuestion = {
        ref: 'q-short',
        textRu: 'Сколько концовок?',
        answers: ['3'],
    };

    it('finds a correct answer inside the fact, ignoring case and ё', () => {
        const hints = findFactAnswerHints(
            {
                ru: 'ГВИНТ так понравился игрокам, что вышел отдельной игрой.',
                en: 'Players liked it so much it became a standalone game.',
            },
            [gwent, year],
        );
        expect(hints.map((hint) => hint.question.ref)).toEqual([
            'q-witcher-gwent',
        ]);
    });

    it('matches whole words only and skips very short answers', () => {
        const hints = findFactAnswerHints(
            {
                ru: 'Гвинтовой механизм и 3 концовки — ничего общего с годом 20155.',
                en: 'Nothing here.',
            },
            [gwent, year, short],
        );
        expect(hints).toEqual([]);
    });

    it('checks the EN text too', () => {
        const hints = findFactAnswerHints(
            { ru: 'Карточная игра вышла отдельно.', en: 'Gwent got its own game.' },
            [gwent],
        );
        expect(hints[0]?.answer).toBe('Gwent');
    });

    it('finds a part of a compound answer', () => {
        const howMany: FactHintQuestion = {
            ref: 'q-stardew-team',
            textRu: 'Сколько человек сделали Stardew Valley?',
            answers: ['Один — Эрик Бароне', 'One — Eric Barone'],
        };
        const hints = findFactAnswerHints(
            {
                ru: 'Stardew Valley сделал один человек — Эрик Бароун.',
                en: 'Stardew Valley was made by one person, Eric Barone.',
            },
            [howMany],
        );
        expect(hints).toHaveLength(1);
        expect(hints[0]?.answer).toBe('Один — Эрик Бароне');
        expect(hints[0]?.match).toBe('Один');
    });

    it('skips answers the caller marks as game titles', () => {
        const guessGame: FactHintQuestion = {
            ref: 'img-half-life-2',
            textRu: 'Из какой игры этот кадр?',
            answers: ['Half-Life 2'],
        };
        const fact = {
            ru: 'Исходный код Half-Life 2 украли в 2003 году.',
            en: 'The Half-Life 2 source code was stolen in 2003.',
        };
        expect(findFactAnswerHints(fact, [guessGame])).toHaveLength(1);
        expect(
            findFactAnswerHints(fact, [guessGame], {
                ignoreAnswer: (answer) => answer === 'Half-Life 2',
            }),
        ).toEqual([]);
    });

    it('does not check parts of an ignored title', () => {
        const guessGame: FactHintQuestion = {
            ref: 'img-re7',
            textRu: 'Угадай игру по изображению.',
            answers: ['Resident Evil 7: Biohazard'],
        };
        const hints = findFactAnswerHints(
            {
                ru: 'В Японии серия называется Biohazard.',
                en: 'In Japan the series is called Biohazard.',
            },
            [guessGame],
            { ignoreAnswer: (answer) => answer.startsWith('Resident Evil') },
        );
        expect(hints).toEqual([]);
    });

    it('normalizes punctuation into single spaces', () => {
        expect(normalizeForHint('«Ёж», ёлка!')).toBe(' еж елка ');
        expect(normalizeForHint('  ...  ')).toBe('');
    });
});
