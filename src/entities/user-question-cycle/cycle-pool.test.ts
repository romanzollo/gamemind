/**
 * «Музыкальные вопросы» выключены: аудио не выдаётся, но мешок не
 * перемешивается заново (размер пула тот же). Pure, без Neon.
 */

import { describe, expect, it } from 'vitest';

import { buildCycleExcludeIds, type CyclePoolRow } from './cycle-pool';
import { drawFromSeededCycle } from './draw-from-question-cycle';

/** 20 вопросов, каждый пятый — аудио (a05, a10, a15, a20). */
const POOL: CyclePoolRow[] = Array.from({ length: 20 }, (_, index) => {
    const n = index + 1;
    const isAudio = n % 5 === 0;
    return {
        id: `${isAudio ? 'a' : 'q'}${String(n).padStart(2, '0')}`,
        isAudio,
    };
});
const POOL_IDS = POOL.map((row) => row.id);
const AUDIO_IDS = POOL.filter((row) => row.isAudio).map((row) => row.id);

const EMPTY_STATE = { cycleNumber: 0, cycleSeed: 0, cursor: 0, poolSize: 0 };

describe('buildCycleExcludeIds', () => {
    it('music on: only the played ids', () => {
        expect(
            buildCycleExcludeIds({
                pool: POOL,
                playedIds: ['q01'],
                includeAudio: true,
            }),
        ).toEqual(['q01']);
        expect(buildCycleExcludeIds({ pool: POOL, includeAudio: true })).toEqual(
            [],
        );
    });

    it('music off: played ids and every audio question, once each', () => {
        const exclude = buildCycleExcludeIds({
            pool: POOL,
            playedIds: ['q01', 'a05'],
            includeAudio: false,
        });

        expect(new Set(exclude)).toEqual(new Set(['q01', ...AUDIO_IDS]));
        expect(exclude).toHaveLength(1 + AUDIO_IDS.length);
    });
});

describe('music off in the seeded cycle', () => {
    const excludeAudio = buildCycleExcludeIds({ pool: POOL, includeAudio: false });

    it('never draws audio and walks the cursor through it', () => {
        let state = EMPTY_STATE;
        const drawn: string[] = [];

        for (let game = 0; game < 4; game += 1) {
            const result = drawFromSeededCycle({
                state,
                poolIds: POOL_IDS,
                needed: 4,
                excludeIds: excludeAudio,
                createSeed: () => 7,
            });
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            drawn.push(...result.drawnIds);
            state = result.nextState;
        }

        expect(drawn.some((id) => AUDIO_IDS.includes(id))).toBe(false);
        // 16 обычных вопросов за 4 игры — без повторов, один цикл.
        expect(new Set(drawn).size).toBe(16);
        expect(state.cycleNumber).toBe(1);
        expect(state.poolSize).toBe(20);
    });

    it('switching music off mid-cycle keeps the cycle (no reshuffle)', () => {
        const withMusic = drawFromSeededCycle({
            state: EMPTY_STATE,
            poolIds: POOL_IDS,
            needed: 5,
            createSeed: () => 7,
        });
        expect(withMusic.ok).toBe(true);
        if (!withMusic.ok) return;

        const withoutMusic = drawFromSeededCycle({
            state: withMusic.nextState,
            poolIds: POOL_IDS,
            needed: 5,
            excludeIds: excludeAudio,
            createSeed: () => 99,
        });
        expect(withoutMusic.ok).toBe(true);
        if (!withoutMusic.ok) return;

        expect(withoutMusic.didReshuffle).toBe(false);
        expect(withoutMusic.nextState.cycleSeed).toBe(
            withMusic.nextState.cycleSeed,
        );
        expect(
            withoutMusic.drawnIds.some((id) => withMusic.drawnIds.includes(id)),
        ).toBe(false);
        expect(withoutMusic.drawnIds.some((id) => AUDIO_IDS.includes(id))).toBe(
            false,
        );
    });

    it('a pool of only audio is NOT_ENOUGH with music off', () => {
        const audioOnly: CyclePoolRow[] = AUDIO_IDS.map((id) => ({
            id,
            isAudio: true,
        }));

        expect(
            drawFromSeededCycle({
                state: EMPTY_STATE,
                poolIds: AUDIO_IDS,
                needed: 2,
                excludeIds: buildCycleExcludeIds({
                    pool: audioOnly,
                    includeAudio: false,
                }),
            }),
        ).toEqual({ ok: false, reason: 'NOT_ENOUGH_QUESTIONS' });
    });
});
