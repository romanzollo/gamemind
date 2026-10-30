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

    it('reshuffle-first when remaining < needed (no mixed-cycle quiz)', () => {
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

        const previousTail = (() => {
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
        expect(seedCalls).toBe(1);
        expect(result.drawnIds).toHaveLength(10);
        expect(new Set(result.drawnIds).size).toBe(10);
        expect(result.nextState.cycleNumber).toBe(
            primed.nextState.cycleNumber + 1,
        );
        expect(result.nextState.cursor).toBe(10);
        expect(result.nextState.cycleSeed).toBe(1001);

        // Хвост старого цикла НЕ обязан идти первым — он вернулся в мешок.
        expect(result.drawnIds.slice(0, 3)).not.toEqual(previousTail);
    });

    it('Classic-3 wrap: no reappear of wrap quiz ids until next reshuffle', () => {
        let state = EMPTY_STATE;
        let seedSeq = 200;
        const createSeed = () => {
            seedSeq += 1;
            return seedSeq;
        };

        // 6×3 = 18 → остаток 2; следующий draw должен reshuffle-first.
        for (let i = 0; i < 6; i += 1) {
            const step = drawFromSeededCycle({
                state,
                poolIds: POOL_20,
                needed: 3,
                createSeed,
            });
            expect(step.ok).toBe(true);
            if (!step.ok) {
                return;
            }
            expect(step.didReshuffle).toBe(i === 0);
            state = step.nextState;
        }

        expect(state.cursor).toBe(18);

        const wrap = drawFromSeededCycle({
            state,
            poolIds: POOL_20,
            needed: 3,
            createSeed,
        });

        expect(wrap.ok).toBe(true);
        if (!wrap.ok) {
            return;
        }

        expect(wrap.didReshuffle).toBe(true);
        expect(wrap.nextState.cursor).toBe(3);

        const wrapIds = new Set(wrap.drawnIds);
        let peekState = wrap.nextState;

        while (peekState.cursor < peekState.poolSize) {
            const peek = drawFromSeededCycle({
                state: peekState,
                poolIds: POOL_20,
                needed: 3,
                createSeed,
            });

            expect(peek.ok).toBe(true);
            if (!peek.ok) {
                return;
            }

            if (peek.didReshuffle) {
                break;
            }

            for (const id of peek.drawnIds) {
                expect(wrapIds.has(id)).toBe(false);
            }

            peekState = peek.nextState;
        }
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

describe('drawFromSeededCycle with exclusions (Survival run)', () => {
    it('skips excluded ids and moves the cursor past them', () => {
        const opened = drawFromSeededCycle({
            state: EMPTY_STATE,
            poolIds: POOL_20,
            needed: 4,
            createSeed: () => 7,
        });
        expect(opened.ok).toBe(true);
        if (!opened.ok) {
            return;
        }

        const plain = drawFromSeededCycle({
            state: opened.nextState,
            poolIds: POOL_20,
            needed: 4,
        });
        expect(plain.ok).toBe(true);
        if (!plain.ok) {
            return;
        }

        // Первые два id следующей порции «уже сыграны в забеге».
        const excludeIds = plain.drawnIds.slice(0, 2);
        const result = drawFromSeededCycle({
            state: opened.nextState,
            poolIds: POOL_20,
            needed: 4,
            excludeIds,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.didReshuffle).toBe(false);
        expect(result.drawnIds).toHaveLength(4);
        for (const id of excludeIds) {
            expect(result.drawnIds).not.toContain(id);
        }
        expect(result.drawnIds.slice(0, 2)).toEqual(plain.drawnIds.slice(2));
        expect(result.nextState.cursor).toBe(opened.nextState.cursor + 6);
    });

    it('reshuffles when the tail without excluded ids is too short', () => {
        const state = { cycleNumber: 1, cycleSeed: 5, cursor: 14, poolSize: 20 };
        const tail = drawFromSeededCycle({
            state,
            poolIds: POOL_20,
            needed: 6,
        });
        expect(tail.ok).toBe(true);
        if (!tail.ok) {
            return;
        }

        // В хвосте 6 id, но один уже сыгран в забеге → на волну 6 не хватает.
        const excludeIds = [tail.drawnIds[0]!, 'q01', 'q02'];
        const result = drawFromSeededCycle({
            state,
            poolIds: POOL_20,
            needed: 6,
            excludeIds,
            createSeed: () => 77,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }

        expect(result.didReshuffle).toBe(true);
        expect(result.nextState.cycleNumber).toBe(2);
        expect(result.drawnIds).toHaveLength(6);
        for (const id of excludeIds) {
            expect(result.drawnIds).not.toContain(id);
        }
    });

    it('never repeats inside a run that crosses the cycle boundary', () => {
        // Цикл начат Классикой: курсор посередине пула.
        let state = { cycleNumber: 1, cycleSeed: 11, cursor: 9, poolSize: 20 };
        const runSeen: string[] = [];
        let seed = 100;

        for (let wave = 0; wave < 10; wave += 1) {
            const result = drawFromSeededCycle({
                state,
                poolIds: POOL_20,
                needed: 6,
                excludeIds: runSeen,
                allowPartial: true,
                createSeed: () => seed++,
            });

            if (!result.ok) {
                break;
            }

            for (const id of result.drawnIds) {
                expect(runSeen).not.toContain(id);
            }
            runSeen.push(...result.drawnIds);
            state = result.nextState;
        }

        expect(new Set(runSeen).size).toBe(20);
        expect(runSeen).toHaveLength(20);
    });

    it('returns a short last wave with allowPartial and fails on zero', () => {
        const excludeIds = POOL_20.slice(0, 17);
        const short = drawFromSeededCycle({
            state: EMPTY_STATE,
            poolIds: POOL_20,
            needed: 6,
            excludeIds,
            allowPartial: true,
            createSeed: () => 3,
        });

        expect(short.ok).toBe(true);
        if (!short.ok) {
            return;
        }
        expect([...short.drawnIds].sort()).toEqual(['q18', 'q19', 'q20']);

        expect(
            drawFromSeededCycle({
                state: EMPTY_STATE,
                poolIds: POOL_20,
                needed: 6,
                excludeIds: POOL_20,
                allowPartial: true,
                createSeed: () => 3,
            }),
        ).toEqual({ ok: false, reason: 'NOT_ENOUGH_QUESTIONS' });

        expect(
            drawFromSeededCycle({
                state: EMPTY_STATE,
                poolIds: POOL_20,
                needed: 6,
                excludeIds,
                createSeed: () => 3,
            }),
        ).toEqual({ ok: false, reason: 'NOT_ENOUGH_QUESTIONS' });
    });
});
