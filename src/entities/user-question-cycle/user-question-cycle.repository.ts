/**
 * Persist / draw UserQuestionCycle (shuffle-bag anti-repeat).
 *
 * Важно (Aug 12, lesson 3):
 * - НЕ на Direct quiz queue (QUIZ_NEON_HOT_PATH).
 * - Fast path = только upsert + slice в памяти + лёгкий UPDATE.
 * - Запрещено: findMany IN(голова) и UPDATE … remainingIds equals весь JSON
 *   массив (~100 id) — на Windows+Neon pooled это зависает >4s, срабатывает
 *   fallback random → одни и те же IMAGE_GUESS «преследуют», а мешок не списывается.
 * - Optimistic lock: userId+difficulty+cycleNumber (без JSON equals).
 *
 * Daily / submit не вызывают.
 */

import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import type { Difficulty } from '@/types';

import { drawFromQuestionCycle } from '@/entities/user-question-cycle/draw-from-question-cycle';

const OPTIMISTIC_DRAW_MAX_ATTEMPTS = 3;

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

async function tryPersistDraw(input: {
    userId: string;
    difficulty: Difficulty;
    expectedCycleNumber: number;
    nextRemainingIds: string[];
    nextCycleNumber: number;
}): Promise<boolean> {
    // Без equals на весь JSON remaining — это и был зависающий UPDATE.
    const result = await prisma.userQuestionCycle.updateMany({
        where: {
            userId: input.userId,
            difficulty: input.difficulty,
            cycleNumber: input.expectedCycleNumber,
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

        let drawnIds: string[];
        let nextRemainingIds: string[];
        let nextCycleNumber: number;
        let didReshuffle: boolean;

        if (remainingIds.length >= input.needed) {
            // Fast path: ноль лишних SELECT. Soft-hide почистим на reshuffle.
            drawnIds = remainingIds.slice(0, input.needed);
            nextRemainingIds = remainingIds.slice(input.needed);
            nextCycleNumber = cycleNumber;
            didReshuffle = false;
        } else {
            const poolIds = await loadActivePublishedPoolIds(input.difficulty);
            assertNotCancelled(cancel);

            const drawn = drawFromQuestionCycle({
                remainingIds,
                cycleNumber,
                poolIds,
                needed: input.needed,
            });

            if (!drawn.ok) {
                return { ok: false, reason: drawn.reason };
            }

            drawnIds = drawn.drawnIds;
            nextRemainingIds = drawn.nextRemainingIds;
            nextCycleNumber = drawn.nextCycleNumber;
            didReshuffle = drawn.didReshuffle;
        }

        assertNotCancelled(cancel);

        const persisted = await tryPersistDraw({
            userId: input.userId,
            difficulty: input.difficulty,
            expectedCycleNumber: cycleNumber,
            nextRemainingIds,
            nextCycleNumber,
        });

        if (persisted) {
            return {
                ok: true,
                questionIds: drawnIds,
                cycleNumber: nextCycleNumber,
                didReshuffle,
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
