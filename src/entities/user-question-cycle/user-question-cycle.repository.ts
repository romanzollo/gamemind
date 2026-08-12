/**
 * Persist / draw UserQuestionCycle (seeded cursor anti-repeat).
 *
 * Senior fix (Aug 12):
 * - Больше НЕ храним remainingIds JSONB — только cycleSeed/cursor/poolSize.
 * - Prisma UPDATE толстого JSONB на Windows+Neon hang >4s → budget →
 *   fallback random → IMAGE_GUESS «преследуют», мешок не списывается.
 * - Нет Promise.race budget, который бросал in-flight UPDATE (зомби COMMIT).
 * - Не на Direct quiz queue (QUIZ_NEON_HOT_PATH): pooled Prisma scalars only.
 *
 * Daily / submit не вызывают.
 */

import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import type { Difficulty } from '@/types';

import {
    drawFromSeededCycle,
    type QuestionCycleState,
} from '@/entities/user-question-cycle/draw-from-question-cycle';

export type DrawUserQuestionCycleIdsResult =
    | {
          ok: true;
          questionIds: string[];
          cycleNumber: number;
          didReshuffle: boolean;
      }
    | { ok: false; reason: 'NOT_ENOUGH_QUESTIONS' };

async function loadOrCreateCycleState(
    userId: string,
    difficulty: Difficulty,
): Promise<QuestionCycleState> {
    const existing = await prisma.userQuestionCycle.findUnique({
        where: {
            userId_difficulty: {
                userId,
                difficulty,
            },
        },
        select: {
            cycleNumber: true,
            cycleSeed: true,
            cursor: true,
            poolSize: true,
        },
    });

    if (existing) {
        return {
            cycleNumber: Number(existing.cycleNumber),
            cycleSeed: Number(existing.cycleSeed),
            cursor: Number(existing.cursor),
            poolSize: Number(existing.poolSize),
        };
    }

    try {
        const created = await prisma.userQuestionCycle.create({
            data: {
                id: randomUUID(),
                userId,
                difficulty,
                cycleNumber: 0,
                cycleSeed: 0,
                cursor: 0,
                poolSize: 0,
            },
            select: {
                cycleNumber: true,
                cycleSeed: true,
                cursor: true,
                poolSize: true,
            },
        });

        return {
            cycleNumber: Number(created.cycleNumber),
            cycleSeed: Number(created.cycleSeed),
            cursor: Number(created.cursor),
            poolSize: Number(created.poolSize),
        };
    } catch {
        // Гонка двух start: второй CREATE ловит unique → читаем победителя.
        const raced = await prisma.userQuestionCycle.findUniqueOrThrow({
            where: {
                userId_difficulty: {
                    userId,
                    difficulty,
                },
            },
            select: {
                cycleNumber: true,
                cycleSeed: true,
                cursor: true,
                poolSize: true,
            },
        });

        return {
            cycleNumber: Number(raced.cycleNumber),
            cycleSeed: Number(raced.cycleSeed),
            cursor: Number(raced.cursor),
            poolSize: Number(raced.poolSize),
        };
    }
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

async function persistCycleState(
    userId: string,
    difficulty: Difficulty,
    expected: QuestionCycleState,
    next: QuestionCycleState,
): Promise<boolean> {
    const result = await prisma.userQuestionCycle.updateMany({
        where: {
            userId,
            difficulty,
            cycleNumber: expected.cycleNumber,
            cycleSeed: expected.cycleSeed,
            cursor: expected.cursor,
            poolSize: expected.poolSize,
        },
        data: {
            cycleNumber: next.cycleNumber,
            cycleSeed: next.cycleSeed,
            cursor: next.cursor,
            poolSize: next.poolSize,
        },
    });

    return result.count > 0;
}

async function drawQuestionIdsOnce(input: {
    userId: string;
    difficulty: Difficulty;
    needed: number;
}): Promise<DrawUserQuestionCycleIdsResult> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const state = await loadOrCreateCycleState(
            input.userId,
            input.difficulty,
        );
        const poolIds = await loadActivePublishedPoolIds(input.difficulty);

        const drawn = drawFromSeededCycle({
            state,
            poolIds,
            needed: input.needed,
        });

        if (!drawn.ok) {
            return { ok: false, reason: drawn.reason };
        }

        const persisted = await persistCycleState(
            input.userId,
            input.difficulty,
            state,
            drawn.nextState,
        );

        if (persisted) {
            return {
                ok: true,
                questionIds: drawn.drawnIds,
                cycleNumber: drawn.nextState.cycleNumber,
                didReshuffle: drawn.didReshuffle,
            };
        }
    }

    throw new Error('UserQuestionCycle optimistic draw failed after 3 attempts');
}

export const userQuestionCycleRepository = {
    /**
     * Забирает N question id из seeded-цикла пользователя.
     * Только Classic/Timed start. Без budget-race и без JSONB мешка.
     */
    async drawQuestionIds(input: {
        userId: string;
        difficulty: Difficulty;
        needed: number;
    }): Promise<DrawUserQuestionCycleIdsResult> {
        return drawQuestionIdsOnce(input);
    },
};
