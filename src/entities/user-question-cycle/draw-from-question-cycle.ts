/**
 * Чистая логика shuffle-bag (User Question Cycle) без Neon / Prisma.
 *
 * Зачем отдельный модуль: правила «взять N / drain+top-up / reshuffle»
 * должны быть тестируемы без Direct queue и не смешиваться с snapshot resolve.
 * Entity-слой держит и pure draw, и repository — features/quiz только вызывает.
 *
 * Инварианты MVP:
 * - порядок раздачи = порядок remainingIds (голова мешка);
 * - деактивированные / не в pool → выкидываем из remaining, цикл не блокируем;
 * - pool.length < needed → NOT_ENOUGH_QUESTIONS (как сейчас у pick);
 * - remaining пуст → новый цикл (shuffle всего pool);
 * - 0 < remaining < needed → сначала добираем хвост, потом top-up из нового цикла
 *   без дублей id внутри одного start (drain-then-top-up);
 * - новые PUBLISHED mid-cycle в текущий remaining не вшиваем (решает вызывающий:
 *   в pool на reshuffle они попадут сами).
 *
 * Пишется в БД только на quiz start (не на submit). Daily эту логику не вызывает.
 */

import { shuffleArray } from '@/shared/utils';

export type DrawFromQuestionCycleInput = {
    /** Хвост текущего цикла (порядок = очередь). */
    remainingIds: readonly string[];
    cycleNumber: number;
    /** Актуальный пул: active + PUBLISHED этой difficulty. */
    poolIds: readonly string[];
    needed: number;
    /** Для тестов: детерминированный shuffle. По умолчанию — Fisher–Yates. */
    shuffle?: <T>(items: readonly T[]) => T[];
};

export type DrawFromQuestionCycleSuccess = {
    ok: true;
    drawnIds: string[];
    nextRemainingIds: string[];
    nextCycleNumber: number;
    /** true, если открыли новый цикл (пустой мешок или drain-then-top-up). */
    didReshuffle: boolean;
};

export type DrawFromQuestionCycleFailure = {
    ok: false;
    reason: 'NOT_ENOUGH_QUESTIONS';
};

export type DrawFromQuestionCycleResult =
    | DrawFromQuestionCycleSuccess
    | DrawFromQuestionCycleFailure;

/**
 * Оставляет в remaining только id, которые ещё есть в актуальном pool.
 * Soft-hide / unpublish не должны «заклинить» хвост мешка.
 */
export function filterRemainingToPool(
    remainingIds: readonly string[],
    poolIds: readonly string[],
): string[] {
    const poolSet = new Set(poolIds);

    return remainingIds.filter((id) => poolSet.has(id));
}

/**
 * Достаёт `needed` id из мешка с drain-then-top-up на границе цикла.
 */
export function drawFromQuestionCycle(
    input: DrawFromQuestionCycleInput,
): DrawFromQuestionCycleResult {
    const {
        cycleNumber,
        needed,
        shuffle = shuffleArray,
    } = input;

    if (needed <= 0) {
        return {
            ok: true,
            drawnIds: [],
            nextRemainingIds: filterRemainingToPool(
                input.remainingIds,
                input.poolIds,
            ),
            nextCycleNumber: cycleNumber,
            didReshuffle: false,
        };
    }

    // Уникальный pool: дубликаты id в источнике не должны ломать take.
    const pool: string[] = [];
    const poolSet = new Set<string>();

    for (const id of input.poolIds) {
        if (!poolSet.has(id)) {
            poolSet.add(id);
            pool.push(id);
        }
    }

    if (pool.length < needed) {
        return { ok: false, reason: 'NOT_ENOUGH_QUESTIONS' };
    }

    let remaining = filterRemainingToPool(input.remainingIds, pool);
    const drawnIds: string[] = [];

    if (remaining.length > 0) {
        const takeCount = Math.min(needed, remaining.length);
        drawnIds.push(...remaining.slice(0, takeCount));
        remaining = remaining.slice(takeCount);
    }

    if (drawnIds.length === needed) {
        return {
            ok: true,
            drawnIds,
            nextRemainingIds: remaining,
            nextCycleNumber: cycleNumber,
            didReshuffle: false,
        };
    }

    // Пустой мешок или хвост короче N → новый цикл + добор без дублей в этом start.
    const nextCycleNumber = cycleNumber + 1;
    const drawnSet = new Set(drawnIds);
    const bag = shuffle(pool).filter((id) => !drawnSet.has(id));
    const needMore = needed - drawnIds.length;

    if (bag.length < needMore) {
        return { ok: false, reason: 'NOT_ENOUGH_QUESTIONS' };
    }

    drawnIds.push(...bag.slice(0, needMore));
    const nextRemainingIds = bag.slice(needMore);

    return {
        ok: true,
        drawnIds,
        nextRemainingIds,
        nextCycleNumber,
        didReshuffle: true,
    };
}
