import { describe, expect, it } from 'vitest';

import {
    hashSeed,
    pickTriviaFact,
    pickTriviaFactsForSession,
    type TriviaFactCandidate,
} from './pick-trivia-fact';

function fact(
    key: string,
    facet: TriviaFactCandidate['facet'] = 'game',
): TriviaFactCandidate {
    return {
        key,
        facet,
        textRu: `ru ${key}`,
        textEn: `en ${key}`,
        sourceUrl: `https://example.com/${key}`,
    };
}

describe('pickTriviaFact', () => {
    it('returns null when there are no candidates', () => {
        expect(pickTriviaFact([], { seed: 's:q' })).toBeNull();
    });

    it('prefers a game fact over a series fact', () => {
        const picked = pickTriviaFact(
            [fact('fact-series-01', 'franchise'), fact('fact-game-01')],
            { seed: 's:q' },
        );
        expect(picked?.key).toBe('fact-game-01');
    });

    it('falls back to the series when game facts were already shown', () => {
        const picked = pickTriviaFact(
            [fact('fact-game-01'), fact('fact-series-01', 'franchise')],
            { seed: 's:q', exclude: ['fact-game-01'] },
        );
        expect(picked?.key).toBe('fact-series-01');
    });

    it('returns null rather than repeat a fact', () => {
        expect(
            pickTriviaFact([fact('fact-game-01')], {
                seed: 's:q',
                exclude: ['fact-game-01'],
            }),
        ).toBeNull();
    });

    it('is deterministic and ignores candidate order', () => {
        const pool = [fact('fact-a'), fact('fact-b'), fact('fact-c')];
        const first = pickTriviaFact(pool, { seed: 'session-1:q-1' });
        const again = pickTriviaFact([...pool].reverse(), {
            seed: 'session-1:q-1',
        });
        expect(again?.key).toBe(first?.key);
    });

    it('spreads different seeds over different facts', () => {
        const pool = [fact('fact-a'), fact('fact-b'), fact('fact-c')];
        const keys = new Set(
            Array.from({ length: 30 }, (_, index) =>
                pickTriviaFact(pool, { seed: `session-${index}:q` })?.key,
            ),
        );
        expect(keys.size).toBe(3);
    });

    it('treats duplicate rows of one fact as one candidate', () => {
        const picked = pickTriviaFact([fact('fact-a'), fact('fact-a')], {
            seed: 's:q',
        });
        expect(picked?.key).toBe('fact-a');
    });
});

describe('hashSeed', () => {
    it('is a stable unsigned 32-bit FNV-1a', () => {
        expect(hashSeed('')).toBe(0x811c9dc5);
        expect(hashSeed('a')).toBe(0xe40c292c);
    });
});

describe('pickTriviaFactsForSession', () => {
    it('does not repeat a fact across questions of one game', () => {
        const shared = [fact('fact-witcher-3-01')];
        const picked = pickTriviaFactsForSession(
            'session-1',
            [
                { questionId: 'q-2', position: 1 },
                { questionId: 'q-1', position: 0 },
            ],
            new Map([
                ['q-1', shared],
                ['q-2', shared],
            ]),
        );
        // Первый по порядку вопрос получает факт, второй — уже нет.
        expect(picked.get('q-1')?.key).toBe('fact-witcher-3-01');
        expect(picked.has('q-2')).toBe(false);
    });

    it('matches what the answer sheet picks for the first question', () => {
        const pool = [fact('fact-a'), fact('fact-b'), fact('fact-c')];
        const sheet = pickTriviaFact(pool, { seed: 'session-9:q-1' });
        const review = pickTriviaFactsForSession(
            'session-9',
            [{ questionId: 'q-1', position: 0 }],
            new Map([['q-1', pool]]),
        );
        expect(review.get('q-1')?.key).toBe(sheet?.key);
    });
});
