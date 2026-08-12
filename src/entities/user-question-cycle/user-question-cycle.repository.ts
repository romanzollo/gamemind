/**
 * Persist / draw UserQuestionCycle (shuffle-bag anti-repeat).
 *
 * Важно (Aug 12): этот мешок НЕ на Direct quiz queue.
 * Unpooled Direct + UserQuestionCycle стабильно ловил 18s timeout в
 * Windows `next dev`, после чего fallback random делал start ~40s.
 * Маленький upsert/update идёт через Prisma pooled — Direct остаётся
 * для snapshot resolve/create/submit (QUIZ_NEON_HOT_PATH).
 *
 * Daily Challenge эту таблицу не вызывает. Submit не вызывает.
 */

import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import type { Difficulty } from '@/types';

import { drawFromQuestionCycle } from '@/entities/user-question-cycle/draw-from-question-cycle';

const OPTIMISTIC_DRAW_MAX_ATTEMPTS = 3;

/** Жёсткий потолок: лучше fallback random, чем держать старт десятки секунд. */
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
        // No-op touch: нужен непустой update, чтобы upsert вернул строку.
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

async function drawQuestionIdsOnce(input: {
    userId: string;
    difficulty: Difficulty;
    needed: number;
}): Promise<DrawUserQuestionCycleIdsResult> {
    for (let attempt = 1; attempt <= OPTIMISTIC_DRAW_MAX_ATTEMPTS; attempt += 1) {
        const row = await loadOrCreateCycleRow(input.userId, input.difficulty);
        const remainingIds = parseRemainingIds(row.remainingIds);
        const cycleNumber = Number(row.cycleNumber);

        let poolIds: string[];

        if (remainingIds.length >= input.needed) {
            poolIds = await filterIdsStillInPool(
                input.difficulty,
                remainingIds,
            );

            if (poolIds.length < input.needed) {
                poolIds = await loadActivePublishedPoolIds(input.difficulty);
            }
        } else {
            poolIds = await loadActivePublishedPoolIds(input.difficulty);
        }

        const drawn = drawFromQuestionCycle({
            remainingIds,
            cycleNumber,
            poolIds,
            needed: input.needed,
        });

        if (!drawn.ok) {
            return { ok: false, reason: drawn.reason };
        }

        const persisted = await tryPersistDraw({
            userId: input.userId,
            difficulty: input.difficulty,
            expectedRemainingIds: remainingIds,
            expectedCycleNumber: cycleNumber,
            nextRemainingIds: drawn.nextRemainingIds,
            nextCycleNumber: drawn.nextCycleNumber,
        });

        if (persisted) {
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

function withBudget<T>(promise: Promise<T>, budgetMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(
                new Error(
                    `UserQuestionCycle draw budget exceeded after ${budgetMs}ms`,
                ),
            );
        }, budgetMs);

        promise.then(
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
    /**
     * Забирает N question id из мешка. Pooled Prisma, не Direct queue.
     * Снаружи всегда оборачивать в try/fallback — budget 4s.
     */
    async drawQuestionIds(input: {
        userId: string;
        difficulty: Difficulty;
        needed: number;
    }): Promise<DrawUserQuestionCycleIdsResult> {
        return withBudget(
            drawQuestionIdsOnce(input),
            USER_QUESTION_CYCLE_DRAW_BUDGET_MS,
        );
    },
};
