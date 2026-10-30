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
 * - граница цикла: если remaining < needed → сразу новый seed и полный добор
 *   (reshuffle-first; хвост возвращается в мешок, без drain-then-top-up);
 * - смена poolSize / seed=0 → новый цикл;
 * - pool < needed → NOT_ENOUGH_QUESTIONS.
 *
 * Почему не drain-then-top-up: хвост + новый shuffle давал повтор drain-id
 * позже в том же цикле (Classic 3 при pool % 3 ≠ 0). Scalar state это не лечит.
 *
 * Исключения (Survival): id, уже сыгранные в забеге, не выдаются. Курсор
 * проходит их насквозь — в этом цикле они считаются показанными (игрок
 * только что их видел). «Хватит ли хвоста» считается без исключённых, так
 * что и на границе цикла забег не получает повторов. Без исключений
 * поведение Classic/Blitz не меняется.
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
    /** Id, которые нельзя выдать (сыгранные в текущем забеге Survival). */
    excludeIds?: readonly string[];
    /**
     * Можно выдать меньше `needed`, если без исключённых пул меньше
     * (последняя короткая волна Survival). Ноль доступных — NOT_ENOUGH.
     */
    allowPartial?: boolean;
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

function countAvailableFrom(
    shuffled: readonly string[],
    cursor: number,
    exclude: ReadonlySet<string>,
): number {
    let count = 0;

    for (let index = cursor; index < shuffled.length; index += 1) {
        if (!exclude.has(shuffled[index]!)) {
            count += 1;
        }
    }

    return count;
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
 * Достаёт `needed` id из seeded-цикла.
 * На границе (хвоста не хватает) — reshuffle-first, без смешения двух циклов в одном квизе.
 */
export function drawFromSeededCycle(
    input: DrawFromSeededCycleInput,
): DrawFromSeededCycleResult {
    const createSeed = input.createSeed ?? randomCycleSeed;
    const pool = uniqueSortedIds(input.poolIds);
    const exclude = new Set(input.excludeIds ?? []);
    const availableInPool = pool.filter((id) => !exclude.has(id)).length;
    const needed = input.allowPartial
        ? Math.min(input.needed, availableInPool)
        : input.needed;

    if (input.needed <= 0) {
        return {
            ok: true,
            drawnIds: [],
            nextState: input.state,
            didReshuffle: false,
        };
    }

    if (needed <= 0 || availableInPool < needed) {
        return { ok: false, reason: 'NOT_ENOUGH_QUESTIONS' };
    }

    let state = input.state;
    let didReshuffle = false;

    if (shouldOpenNewCycle(state, pool.length)) {
        state = openNewCycle(state.cycleNumber, pool.length, createSeed);
        didReshuffle = true;
    } else if (
        countAvailableFrom(
            buildShuffledPool(pool, state.cycleSeed),
            state.cursor,
            exclude,
        ) < needed
    ) {
        // Хвоста мало на целый квиз: не добираем из двух циклов (анти-повтор).
        // Неиспользованный хвост вернётся через новый seed.
        state = openNewCycle(state.cycleNumber, pool.length, createSeed);
        didReshuffle = true;
    }

    const shuffled = buildShuffledPool(pool, state.cycleSeed);
    const drawnIds: string[] = [];
    let cursor = state.cursor;

    while (drawnIds.length < needed && cursor < shuffled.length) {
        const id = shuffled[cursor]!;
        cursor += 1;

        if (!exclude.has(id)) {
            drawnIds.push(id);
        }
    }

    if (drawnIds.length < needed) {
        // После reshuffle-first при pool >= needed не должно случаться.
        return { ok: false, reason: 'NOT_ENOUGH_QUESTIONS' };
    }

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
