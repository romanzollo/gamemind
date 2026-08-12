/**
 * Чистая логика User Question Cycle: seeded shuffle + cursor (без JSON-мешка).
 *
 * Зачем не remainingIds[] в БД:
 * UPDATE JSONB на ~100 id через Prisma/Neon в Windows next dev стабильно
 * превышал budget → fallback на random → одни и те же IMAGE_GUESS «липли».
 * Здесь в БД только скаляры; порядок восстанавливается seed'ом в памяти.
 *
 * Инварианты:
 * - один проход pool без повторов до исчерпания cursor;
 * - drain-then-top-up на границе цикла (хвост + новый seed);
 * - смена poolSize / seed=0 → новый цикл;
 * - pool < needed → NOT_ENOUGH_QUESTIONS.
 */

import {
    randomCycleSeed,
    shuffleWithSeed,
} from '@/shared/utils/seeded-shuffle';

export type QuestionCycleState = {
    cycleNumber: number;
    cycleSeed: number;
    cursor: number;
    poolSize: number;
};

export type DrawFromSeededCycleSuccess = {
    ok: true;
    drawnIds: string[];
    nextState: QuestionCycleState;
    didReshuffle: boolean;
};

export type DrawFromSeededCycleFailure = {
    ok: false;
    reason: 'NOT_ENOUGH_QUESTIONS';
};

export type DrawFromSeededCycleResult =
    | DrawFromSeededCycleSuccess
    | DrawFromSeededCycleFailure;

export type DrawFromSeededCycleInput = {
    state: QuestionCycleState;
    poolIds: readonly string[];
    needed: number;
    /** Для тестов — фиксированный seed нового цикла. */
    createSeed?: () => number;
};

function uniqueSortedIds(poolIds: readonly string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const id of poolIds) {
        if (!seen.has(id)) {
            seen.add(id);
            unique.push(id);
        }
    }

    return unique.sort((left, right) => left.localeCompare(right));
}

function buildShuffledPool(poolIds: readonly string[], seed: number): string[] {
    return shuffleWithSeed(poolIds, seed);
}

function openNewCycle(
    previousCycleNumber: number,
    poolSize: number,
    createSeed: () => number,
): QuestionCycleState {
    return {
        cycleNumber: previousCycleNumber + 1,
        cycleSeed: createSeed(),
        cursor: 0,
        poolSize,
    };
}

function shouldOpenNewCycle(
    state: QuestionCycleState,
    poolSize: number,
): boolean {
    if (poolSize <= 0) {
        return true;
    }

    if (state.cycleSeed === 0 || state.poolSize === 0) {
        return true;
    }

    if (state.poolSize !== poolSize) {
        return true;
    }

    if (state.cursor >= state.poolSize) {
        return true;
    }

    return false;
}

/**
 * Достаёт `needed` id из seeded-цикла с drain-then-top-up на границе.
 */
export function drawFromSeededCycle(
    input: DrawFromSeededCycleInput,
): DrawFromSeededCycleResult {
    const createSeed = input.createSeed ?? randomCycleSeed;
    const pool = uniqueSortedIds(input.poolIds);
    const needed = input.needed;

    if (needed <= 0) {
        return {
            ok: true,
            drawnIds: [],
            nextState: input.state,
            didReshuffle: false,
        };
    }

    if (pool.length < needed) {
        return { ok: false, reason: 'NOT_ENOUGH_QUESTIONS' };
    }

    let state = input.state;
    let didReshuffle = false;

    if (shouldOpenNewCycle(state, pool.length)) {
        state = openNewCycle(state.cycleNumber, pool.length, createSeed);
        didReshuffle = true;
    }

    const shuffled = buildShuffledPool(pool, state.cycleSeed);
    const drawnIds: string[] = [];
    let cursor = state.cursor;

    while (drawnIds.length < needed && cursor < shuffled.length) {
        drawnIds.push(shuffled[cursor]!);
        cursor += 1;
    }

    if (drawnIds.length === needed) {
        return {
            ok: true,
            drawnIds,
            nextState: {
                cycleNumber: state.cycleNumber,
                cycleSeed: state.cycleSeed,
                cursor,
                poolSize: state.poolSize,
            },
            didReshuffle,
        };
    }

    // Хвост текущего цикла уже в drawnIds. Новый цикл + добор без дублей.
    const next = openNewCycle(state.cycleNumber, pool.length, createSeed);
    const nextShuffled = buildShuffledPool(pool, next.cycleSeed);
    const drawnSet = new Set(drawnIds);
    let nextCursor = 0;

    for (; nextCursor < nextShuffled.length; nextCursor += 1) {
        if (drawnIds.length >= needed) {
            break;
        }

        const id = nextShuffled[nextCursor]!;

        if (drawnSet.has(id)) {
            continue;
        }

        drawnIds.push(id);
        drawnSet.add(id);
    }

    if (drawnIds.length < needed) {
        return { ok: false, reason: 'NOT_ENOUGH_QUESTIONS' };
    }

    return {
        ok: true,
        drawnIds,
        nextState: {
            cycleNumber: next.cycleNumber,
            cycleSeed: next.cycleSeed,
            cursor: nextCursor,
            poolSize: next.poolSize,
        },
        didReshuffle: true,
    };
}
