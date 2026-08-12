/**
 * Unit-тесты shuffle-bag User Question Cycle (pure, без Neon).
 *
 * Фиксируем: порядок головы мешка, drain-then-top-up, filter inactive,
 * no dupes до исчерпания цикла, NOT_ENOUGH_QUESTIONS при малом pool.
 */

import { describe, expect, it } from 'vitest';

import {
    drawFromQuestionCycle,
    filterRemainingToPool,
} from './draw-from-question-cycle';

/** Детерминированный «shuffle»: не меняет порядок — удобно проверять take. */
function identityShuffle<T>(items: readonly T[]): T[] {
    return [...items];
}

const POOL_20 = Array.from({ length: 20 }, (_, i) => `q${i + 1}`);

describe('filterRemainingToPool', () => {
    it('drops ids that are no longer in the active pool', () => {
        expect(
            filterRemainingToPool(
                ['q1', 'gone', 'q2', 'also-gone'],
                ['q1', 'q2', 'q3'],
            ),
        ).toEqual(['q1', 'q2']);
    });

    it('keeps order of remaining ids', () => {
        expect(
            filterRemainingToPool(['q3', 'q1', 'q2'], ['q1', 'q2', 'q3']),
        ).toEqual(['q3', 'q1', 'q2']);
    });
});

describe('drawFromQuestionCycle', () => {
    it('returns NOT_ENOUGH_QUESTIONS when pool is smaller than needed', () => {
        const result = drawFromQuestionCycle({
            remainingIds: [],
            cycleNumber: 1,
            poolIds: ['a', 'b', 'c'],
            needed: 10,
            shuffle: identityShuffle,
        });

        expect(result).toEqual({
            ok: false,
            reason: 'NOT_ENOUGH_QUESTIONS',
        });
    });

    it('takes from the front of remaining without reshuffle when enough left', () => {
        const result = drawFromQuestionCycle({
            remainingIds: ['a', 'b', 'c', 'd', 'e'],
            cycleNumber: 2,
            poolIds: ['a', 'b', 'c', 'd', 'e', 'f'],
            needed: 3,
            shuffle: identityShuffle,
        });

        expect(result).toEqual({
            ok: true,
            drawnIds: ['a', 'b', 'c'],
            nextRemainingIds: ['d', 'e'],
            nextCycleNumber: 2,
            didReshuffle: false,
        });
    });

    it('reshuffles full pool when remaining is empty', () => {
        const result = drawFromQuestionCycle({
            remainingIds: [],
            cycleNumber: 1,
            poolIds: ['a', 'b', 'c', 'd', 'e'],
            needed: 3,
            shuffle: identityShuffle,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.didReshuffle).toBe(true);
        expect(result.nextCycleNumber).toBe(2);
        expect(result.drawnIds).toEqual(['a', 'b', 'c']);
        expect(result.nextRemainingIds).toEqual(['d', 'e']);
    });

    it('drain-then-top-up: leftover tail is drawn before new-cycle fill', () => {
        // Хвост 3, нужно 10, pool 20 — пользователь ОБЯЗАН увидеть хвост.
        const remainingIds = ['tail1', 'tail2', 'tail3'];
        const poolIds = [...remainingIds, ...POOL_20.slice(0, 17)];

        const result = drawFromQuestionCycle({
            remainingIds,
            cycleNumber: 4,
            poolIds,
            needed: 10,
            shuffle: identityShuffle,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.didReshuffle).toBe(true);
        expect(result.nextCycleNumber).toBe(5);
        expect(result.drawnIds.slice(0, 3)).toEqual([
            'tail1',
            'tail2',
            'tail3',
        ]);
        expect(result.drawnIds).toHaveLength(10);
        expect(new Set(result.drawnIds).size).toBe(10);
        // Хвост и добор не должны остаться в remaining этого цикла.
        for (const id of result.drawnIds) {
            expect(result.nextRemainingIds).not.toContain(id);
        }
        expect(result.nextRemainingIds).toHaveLength(poolIds.length - 10);
    });

    it('does not skip leftover ids by reshuffling them away', () => {
        const result = drawFromQuestionCycle({
            remainingIds: ['only-left'],
            cycleNumber: 1,
            poolIds: ['only-left', 'p2', 'p3', 'p4', 'p5'],
            needed: 3,
            shuffle: identityShuffle,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.drawnIds[0]).toBe('only-left');
        expect(result.drawnIds).toContain('only-left');
    });

    it('removes deactivated ids from remaining before draw', () => {
        const result = drawFromQuestionCycle({
            remainingIds: ['dead', 'a', 'b', 'c'],
            cycleNumber: 1,
            poolIds: ['a', 'b', 'c', 'd'],
            needed: 2,
            shuffle: identityShuffle,
        });

        expect(result).toEqual({
            ok: true,
            drawnIds: ['a', 'b'],
            nextRemainingIds: ['c'],
            nextCycleNumber: 1,
            didReshuffle: false,
        });
    });

    it('never repeats an id within one cycle until the bag is exhausted', () => {
        let remainingIds: string[] = [];
        let cycleNumber = 0;
        const seenInCycle = new Set<string>();
        const needed = 5;

        // Первый draw откроет cycle 1.
        for (let i = 0; i < 4; i += 1) {
            const result = drawFromQuestionCycle({
                remainingIds,
                cycleNumber,
                poolIds: POOL_20,
                needed,
                shuffle: identityShuffle,
            });

            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }

            if (result.didReshuffle) {
                seenInCycle.clear();
            }

            for (const id of result.drawnIds) {
                expect(seenInCycle.has(id)).toBe(false);
                seenInCycle.add(id);
            }

            remainingIds = result.nextRemainingIds;
            cycleNumber = result.nextCycleNumber;
        }

        // 4×5 = 20 — ровно один полный проход pool.
        expect(seenInCycle.size).toBe(20);
        expect(remainingIds).toEqual([]);
    });

    it('after full exhaust, next draw may reuse pool ids in a new cycle', () => {
        const first = drawFromQuestionCycle({
            remainingIds: [],
            cycleNumber: 0,
            poolIds: ['a', 'b', 'c'],
            needed: 3,
            shuffle: identityShuffle,
        });

        expect(first.ok).toBe(true);
        if (!first.ok) {
            return;
        }

        expect(first.drawnIds).toEqual(['a', 'b', 'c']);
        expect(first.nextRemainingIds).toEqual([]);

        const second = drawFromQuestionCycle({
            remainingIds: first.nextRemainingIds,
            cycleNumber: first.nextCycleNumber,
            poolIds: ['a', 'b', 'c'],
            needed: 3,
            shuffle: identityShuffle,
        });

        expect(second.ok).toBe(true);
        if (!second.ok) {
            return;
        }

        expect(second.didReshuffle).toBe(true);
        expect(second.nextCycleNumber).toBe(first.nextCycleNumber + 1);
        expect(second.drawnIds).toEqual(['a', 'b', 'c']);
    });
});
