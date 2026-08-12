/**
 * Unit-тесты seeded User Question Cycle (pure, без Neon).
 */

import { describe, expect, it } from 'vitest';

import { drawFromSeededCycle } from './draw-from-question-cycle';

const EMPTY_STATE = {
    cycleNumber: 0,
    cycleSeed: 0,
    cursor: 0,
    poolSize: 0,
};

const POOL_20 = Array.from({ length: 20 }, (_, i) => `q${String(i + 1).padStart(2, '0')}`);

describe('drawFromSeededCycle', () => {
    it('returns NOT_ENOUGH_QUESTIONS when pool is smaller than needed', () => {
        const result = drawFromSeededCycle({
            state: EMPTY_STATE,
            poolIds: ['a', 'b', 'c'],
            needed: 10,
            createSeed: () => 1,
        });

        expect(result).toEqual({
            ok: false,
            reason: 'NOT_ENOUGH_QUESTIONS',
        });
    });

    it('opens first cycle and advances cursor without repeats', () => {
        const first = drawFromSeededCycle({
            state: EMPTY_STATE,
            poolIds: POOL_20,
            needed: 5,
            createSeed: () => 42,
        });

        expect(first.ok).toBe(true);
        if (!first.ok) {
            return;
        }

        expect(first.didReshuffle).toBe(true);
        expect(first.drawnIds).toHaveLength(5);
        expect(new Set(first.drawnIds).size).toBe(5);
        expect(first.nextState.cursor).toBe(5);
        expect(first.nextState.cycleNumber).toBe(1);
        expect(first.nextState.poolSize).toBe(20);

        const second = drawFromSeededCycle({
            state: first.nextState,
            poolIds: POOL_20,
            needed: 5,
            createSeed: () => 99,
        });

        expect(second.ok).toBe(true);
        if (!second.ok) {
            return;
        }

        expect(second.didReshuffle).toBe(false);
        expect(second.nextState.cycleSeed).toBe(first.nextState.cycleSeed);

        for (const id of second.drawnIds) {
            expect(first.drawnIds).not.toContain(id);
        }
    });

    it('never repeats within one full cycle until exhaust', () => {
        let state = EMPTY_STATE;
        const seen = new Set<string>();
        let seedSeq = 1;

        for (let i = 0; i < 4; i += 1) {
            const result = drawFromSeededCycle({
                state,
                poolIds: POOL_20,
                needed: 5,
                createSeed: () => {
                    seedSeq += 1;
                    return seedSeq;
                },
            });

            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }

            if (result.didReshuffle && i > 0) {
                seen.clear();
            }

            for (const id of result.drawnIds) {
                expect(seen.has(id)).toBe(false);
                seen.add(id);
            }

            state = result.nextState;
        }

        expect(seen.size).toBe(20);
        expect(state.cursor).toBe(20);
    });

    it('drain-then-top-up keeps leftover tail in the quiz', () => {
        // Подгоняем состояние: cursor у хвоста длины 3, needed 10.
        const primed = drawFromSeededCycle({
            state: EMPTY_STATE,
            poolIds: POOL_20,
            needed: 17,
            createSeed: () => 7,
        });

        expect(primed.ok).toBe(true);
        if (!primed.ok) {
            return;
        }

        expect(primed.nextState.cursor).toBe(17);

        let seedCalls = 0;
        const result = drawFromSeededCycle({
            state: primed.nextState,
            poolIds: POOL_20,
            needed: 10,
            createSeed: () => {
                seedCalls += 1;
                return 1000 + seedCalls;
            },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.didReshuffle).toBe(true);
        expect(result.drawnIds).toHaveLength(10);
        expect(new Set(result.drawnIds).size).toBe(10);

        // Хвост предыдущего цикла — первые 3 drawn.
        const previousShuffledTail = (() => {
            // Reconstruct: first cycle seed 7, take last 3 of remaining 3.
            const full = drawFromSeededCycle({
                state: EMPTY_STATE,
                poolIds: POOL_20,
                needed: 20,
                createSeed: () => 7,
            });
            if (!full.ok) {
                return [];
            }
            return full.drawnIds.slice(17);
        })();

        expect(result.drawnIds.slice(0, 3)).toEqual(previousShuffledTail);
    });

    it('same seed + cursor is deterministic', () => {
        const a = drawFromSeededCycle({
            state: EMPTY_STATE,
            poolIds: POOL_20,
            needed: 10,
            createSeed: () => 123,
        });
        const b = drawFromSeededCycle({
            state: EMPTY_STATE,
            poolIds: POOL_20,
            needed: 10,
            createSeed: () => 123,
        });

        expect(a.ok && b.ok).toBe(true);
        if (!a.ok || !b.ok) {
            return;
        }

        expect(a.drawnIds).toEqual(b.drawnIds);
    });
});
