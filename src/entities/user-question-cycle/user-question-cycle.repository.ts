/**
 * Persist / draw UserQuestionCycle (shuffle-bag anti-repeat).
 *
 * Важно (Aug 12): мешок НЕ на Direct quiz queue (QUIZ_NEON_HOT_PATH).
 * Pooled Prisma + короткий budget. Если budget вышел — fallback random,
 * но in-flight НЕ должен успеть записать мешок после cancel (иначе
 * рассинхрон + prisma Connection terminated от брошенного запроса).
 *
 * Fast path: remaining хватает → take в памяти + один UPDATE.
 * Не делаем findMany id IN (все remaining) — на ~100 id pooled Neon
 * стабильно не укладывался в 4s → ложный fallback и «повторы».
 *
 * Daily / submit эту таблицу не вызывают.
 */

import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import type { Difficulty } from '@/types';

import { drawFromQuestionCycle } from '@/entities/user-question-cycle/draw-from-question-cycle';

const OPTIMISTIC_DRAW_MAX_ATTEMPTS = 3;

/** Жёсткий потолок: лучше fallback random, чем старт десятки секунд. */
export const USER_QUESTION_CYCLE_DRAW_BUDGET_MS = 4_000;

export type DrawUserQuestionCycleIdsResult =
    | {
          ok: true;
          questionIds: string[];
          cycleNumber: number;
          didReshuffle: boolean;
      }
    | { ok: false; reason: 'NOT_ENOUGH_QUESTIONS' };

function parseRemainingIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    if (!value.every((item) => typeof item === 'string')) {
        return [];
    }

    return value;
}

async function loadOrCreateCycleRow(userId: string, difficulty: Difficulty) {
    return prisma.userQuestionCycle.upsert({
        where: {
            userId_difficulty: {
                userId,
                difficulty,
            },
        },
        create: {
            id: randomUUID(),
            userId,
            difficulty,
            remainingIds: [],
            cycleNumber: 0,
        },
        update: {
            updatedAt: new Date(),
        },
        select: {
            remainingIds: true,
            cycleNumber: true,
        },
    });
}

async function loadActivePublishedPoolIds(
    difficulty: Difficulty,
): Promise<string[]> {
    const rows = await prisma.question.findMany({
        where: {
            difficulty,
            isActive: true,
            publicationStatus: 'PUBLISHED',
        },
        select: { id: true },
    });

    return rows.map((row) => row.id);
}

/**
 * Узкая проверка только для id, которые собираемся отдать в квиз (N ≤ 10).
 * Не сканировать весь remaining через IN (...100+).
 */
async function filterIdsStillInPool(
    difficulty: Difficulty,
    candidateIds: string[],
): Promise<string[]> {
    if (candidateIds.length === 0) {
        return [];
    }

    const rows = await prisma.question.findMany({
        where: {
            id: { in: candidateIds },
            difficulty,
            isActive: true,
            publicationStatus: 'PUBLISHED',
        },
        select: { id: true },
    });

    const alive = new Set(rows.map((row) => row.id));

    return candidateIds.filter((id) => alive.has(id));
}

async function tryPersistDraw(input: {
    userId: string;
    difficulty: Difficulty;
    expectedRemainingIds: string[];
    expectedCycleNumber: number;
    nextRemainingIds: string[];
    nextCycleNumber: number;
}): Promise<boolean> {
    const result = await prisma.userQuestionCycle.updateMany({
        where: {
            userId: input.userId,
            difficulty: input.difficulty,
            cycleNumber: input.expectedCycleNumber,
            remainingIds: { equals: input.expectedRemainingIds },
        },
        data: {
            remainingIds: input.nextRemainingIds,
            cycleNumber: input.nextCycleNumber,
        },
    });

    return result.count > 0;
}

type CancelFlag = { cancelled: boolean };

function assertNotCancelled(cancel: CancelFlag) {
    if (cancel.cancelled) {
        throw new Error('UserQuestionCycle draw cancelled by budget');
    }
}

async function drawQuestionIdsOnce(
    input: {
        userId: string;
        difficulty: Difficulty;
        needed: number;
    },
    cancel: CancelFlag,
): Promise<DrawUserQuestionCycleIdsResult> {
    for (let attempt = 1; attempt <= OPTIMISTIC_DRAW_MAX_ATTEMPTS; attempt += 1) {
        assertNotCancelled(cancel);

        const row = await loadOrCreateCycleRow(input.userId, input.difficulty);
        assertNotCancelled(cancel);

        const remainingIds = parseRemainingIds(row.remainingIds);
        const cycleNumber = Number(row.cycleNumber);

        let poolIds: string[];
        let remainingForDraw = remainingIds;

        if (remainingIds.length >= input.needed) {
            // Fast path: не тянем весь банк и не IN(весь remaining).
            // Проверяем только голову мешка (needed + небольшой запас на soft-hide).
            const head = remainingIds.slice(0, input.needed + 5);
            const aliveHead = await filterIdsStillInPool(
                input.difficulty,
                head,
            );
            assertNotCancelled(cancel);

            if (aliveHead.length >= input.needed) {
                // pool = alive head + хвост без повторной проверки (хвост проверим в следующих стартах).
                const tail = remainingIds.slice(head.length);
                poolIds = [...aliveHead, ...tail];
                remainingForDraw = poolIds;
            } else {
                poolIds = await loadActivePublishedPoolIds(input.difficulty);
                assertNotCancelled(cancel);
            }
        } else {
            poolIds = await loadActivePublishedPoolIds(input.difficulty);
            assertNotCancelled(cancel);
        }

        const drawn = drawFromQuestionCycle({
            remainingIds: remainingForDraw,
            cycleNumber,
            poolIds,
            needed: input.needed,
        });

        if (!drawn.ok) {
            return { ok: false, reason: drawn.reason };
        }

        assertNotCancelled(cancel);

        const persisted = await tryPersistDraw({
            userId: input.userId,
            difficulty: input.difficulty,
            // Optimistic lock по факту в БД до наших правок головы.
            expectedRemainingIds: remainingIds,
            expectedCycleNumber: cycleNumber,
            nextRemainingIds: drawn.nextRemainingIds,
            nextCycleNumber: drawn.nextCycleNumber,
        });

        if (persisted) {
            // Если budget уже вышел, но UPDATE прошёл — возвращаем эти id,
            // иначе fallback random + списанный мешок = дыры и путаница.
            return {
                ok: true,
                questionIds: drawn.drawnIds,
                cycleNumber: drawn.nextCycleNumber,
                didReshuffle: drawn.didReshuffle,
            };
        }
    }

    throw new Error(
        `UserQuestionCycle optimistic draw failed after ${OPTIMISTIC_DRAW_MAX_ATTEMPTS} attempts`,
    );
}

function withBudget<T>(
    run: (cancel: CancelFlag) => Promise<T>,
    budgetMs: number,
): Promise<T> {
    const cancel: CancelFlag = { cancelled: false };

    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            cancel.cancelled = true;
            reject(
                new Error(
                    `UserQuestionCycle draw budget exceeded after ${budgetMs}ms`,
                ),
            );
        }, budgetMs);

        run(cancel).then(
            (value) => {
                clearTimeout(timer);
                // Успех после cancel всё же принимаем: мешок уже согласован с drawn.
                resolve(value);
            },
            (error: unknown) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

export const userQuestionCycleRepository = {
    /**
     * Забирает N question id из мешка. Pooled Prisma, не Direct queue.
     * Снаружи — try/fallback на random при budget/ошибке.
     */
    async drawQuestionIds(input: {
        userId: string;
        difficulty: Difficulty;
        needed: number;
    }): Promise<DrawUserQuestionCycleIdsResult> {
        return withBudget(
            (cancel) => drawQuestionIdsOnce(input, cancel),
            USER_QUESTION_CYCLE_DRAW_BUDGET_MS,
        );
    },
};
