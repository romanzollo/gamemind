/**
 * Persist / draw UserQuestionCycle (seeded cursor anti-repeat).
 *
 * Senior fix (Aug 12):
 * - Скаляры cycleSeed/cursor/poolSize (не JSONB remainingIds).
 * - НЕ Prisma: pooled adapter на Windows+Neon часто рвёт сокет после COMMIT
 *   → ложный DB_TIMEOUT, хотя UPDATE уже прошёл.
 * - Raw `pg` через `withPooledPgClient` (DATABASE_URL), ВНЕ Direct quiz queue:
 *   cycle на Direct клинил start/home/submit (история A).
 * - Один client, 2–3 autocommit query; optimistic UPDATE; без Promise.race budget.
 * - Transient после UPDATE → verify nextState (как quiz write recovery).
 *
 * Mix (Classic/Blitz): compute на pooled, persist на свежем pooled (не тот же
 * сокет после fat SELECT). Не BEGIN. Не `withDirectPg*`.
 * После cycle — 300ms settle перед Direct resolve (очередь так же ждёт 300ms).
 * Daily / submit не вызывают.
 */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import {
    drawFromSeededCycle,
    type QuestionCycleState,
} from '@/entities/user-question-cycle/draw-from-question-cycle';
import {
    isTransientDirectPgError,
    withPooledPgClient,
} from '@/lib/db/direct-pg';
import type { Difficulty } from '@/types';

export type DrawUserQuestionCycleIdsResult =
    | {
          ok: true;
          questionIds: string[];
          cycleNumber: number;
          didReshuffle: boolean;
      }
    | { ok: false; reason: 'NOT_ENOUGH_QUESTIONS' };

export type DrawMixedUserQuestionCycleIdsInput = {
    userId: string;
    /** Последовательные куски сплита (EASY → MEDIUM → HARD). Не MIXED-мешок. */
    draws: Array<{ difficulty: Difficulty; needed: number }>;
};

export type DrawMixedUserQuestionCycleIdsResult =
    | { ok: true; questionIds: string[] }
    | { ok: false; reason: 'NOT_ENOUGH_QUESTIONS' };

type CycleStateRow = {
    cycle_number: number | string;
    cycle_seed: number | string;
    cursor: number | string;
    pool_size: number | string;
};

function rowToState(row: CycleStateRow): QuestionCycleState {
    return {
        cycleNumber: Number(row.cycle_number),
        cycleSeed: Number(row.cycle_seed),
        cursor: Number(row.cursor),
        poolSize: Number(row.pool_size),
    };
}

function statesEqual(
    left: QuestionCycleState,
    right: QuestionCycleState,
): boolean {
    return (
        left.cycleNumber === right.cycleNumber &&
        left.cycleSeed === right.cycleSeed &&
        left.cursor === right.cursor &&
        left.poolSize === right.poolSize
    );
}

async function loadCycleState(
    client: Client,
    userId: string,
    difficulty: Difficulty,
): Promise<QuestionCycleState | null> {
    const result = await client.query<CycleStateRow>(
        `
            SELECT
                "cycleNumber" AS cycle_number,
                "cycleSeed" AS cycle_seed,
                "cursor",
                "poolSize" AS pool_size
            FROM "UserQuestionCycle"
            WHERE "userId" = $1
              AND "difficulty" = $2::"Difficulty"
            LIMIT 1
        `,
        [userId, difficulty],
    );

    const row = result.rows[0];
    return row ? rowToState(row) : null;
}

async function loadOrCreateCycleState(
    client: Client,
    userId: string,
    difficulty: Difficulty,
): Promise<QuestionCycleState> {
    const existing = await loadCycleState(client, userId, difficulty);

    if (existing) {
        return existing;
    }

    await client.query(
        `
            INSERT INTO "UserQuestionCycle" (
                "id",
                "userId",
                "difficulty",
                "cycleNumber",
                "cycleSeed",
                "cursor",
                "poolSize",
                "createdAt",
                "updatedAt"
            )
            VALUES (
                $1,
                $2,
                $3::"Difficulty",
                0,
                0,
                0,
                0,
                NOW(),
                NOW()
            )
            ON CONFLICT ("userId", "difficulty") DO NOTHING
        `,
        [randomUUID(), userId, difficulty],
    );

    const created = await loadCycleState(client, userId, difficulty);

    if (!created) {
        throw new Error('UserQuestionCycle get-or-create failed');
    }

    return created;
}

async function loadActivePublishedPoolIds(
    client: Client,
    difficulty: Difficulty,
): Promise<string[]> {
    const result = await client.query<{ id: string }>(
        `
            SELECT q."id"
            FROM "Question" q
            WHERE
                q."difficulty" = $1::"Difficulty"
                AND q."isActive" = true
                AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
        `,
        [difficulty],
    );

    return result.rows.map((row) => row.id);
}

/**
 * Optimistic scalar UPDATE. true = наша версия; false = конфликт (retry draw).
 */
async function persistCycleState(
    client: Client,
    userId: string,
    difficulty: Difficulty,
    expected: QuestionCycleState,
    next: QuestionCycleState,
): Promise<boolean> {
    const result = await client.query(
        `
            UPDATE "UserQuestionCycle"
            SET
                "cycleNumber" = $3,
                "cycleSeed" = $4,
                "cursor" = $5,
                "poolSize" = $6,
                "updatedAt" = NOW()
            WHERE
                "userId" = $1
                AND "difficulty" = $2::"Difficulty"
                AND "cycleNumber" = $7
                AND "cycleSeed" = $8
                AND "cursor" = $9
                AND "poolSize" = $10
        `,
        [
            userId,
            difficulty,
            next.cycleNumber,
            next.cycleSeed,
            next.cursor,
            next.poolSize,
            expected.cycleNumber,
            expected.cycleSeed,
            expected.cursor,
            expected.poolSize,
        ],
    );

    return (result.rowCount ?? 0) > 0;
}

async function verifyCycleStateApplied(
    userId: string,
    difficulty: Difficulty,
    expectedNext: QuestionCycleState,
): Promise<boolean> {
    try {
        const current = await withPooledPgClient(
            (client) => loadCycleState(client, userId, difficulty),
            { debugLabel: 'quiz.cycle.verify' },
        );

        return current != null && statesEqual(current, expectedNext);
    } catch {
        return false;
    }
}

type DrawHopResult =
    | DrawUserQuestionCycleIdsResult
    | { ok: false; reason: 'CONFLICT' };

type PreparedBagDraw = {
    difficulty: Difficulty;
    questionIds: string[];
    expected: QuestionCycleState;
    nextState: QuestionCycleState;
    didReshuffle: boolean;
};

/**
 * Load + seeded draw, без UPDATE. Mix persist'ит на свежем pooled client:
 * fat SELECT id и UPDATE на одном сокете (mix 10) висели ~19s.
 */
async function computeBagDrawOnClient(
    client: Client,
    input: {
        userId: string;
        difficulty: Difficulty;
        needed: number;
    },
): Promise<
    | { ok: true; bag: Omit<PreparedBagDraw, 'difficulty'> }
    | { ok: false; reason: 'NOT_ENOUGH_QUESTIONS' }
> {
    const state = await loadOrCreateCycleState(
        client,
        input.userId,
        input.difficulty,
    );
    const poolIds = await loadActivePublishedPoolIds(client, input.difficulty);

    const drawn = drawFromSeededCycle({
        state,
        poolIds,
        needed: input.needed,
    });

    if (!drawn.ok) {
        return { ok: false, reason: 'NOT_ENOUGH_QUESTIONS' };
    }

    return {
        ok: true,
        bag: {
            questionIds: drawn.drawnIds,
            expected: state,
            nextState: drawn.nextState,
            didReshuffle: drawn.didReshuffle,
        },
    };
}

async function drawQuestionIdsOnce(input: {
    userId: string;
    difficulty: Difficulty;
    needed: number;
}): Promise<DrawUserQuestionCycleIdsResult> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        let pendingDraw:
            | {
                  questionIds: string[];
                  nextState: QuestionCycleState;
                  didReshuffle: boolean;
              }
            | undefined;

        try {
            const result: DrawHopResult = await withPooledPgClient(
                async (client): Promise<DrawHopResult> => {
                    const computed = await computeBagDrawOnClient(client, input);

                    if (!computed.ok) {
                        return computed;
                    }

                    pendingDraw = {
                        questionIds: computed.bag.questionIds,
                        nextState: computed.bag.nextState,
                        didReshuffle: computed.bag.didReshuffle,
                    };

                    const persisted = await persistCycleState(
                        client,
                        input.userId,
                        input.difficulty,
                        computed.bag.expected,
                        computed.bag.nextState,
                    );

                    if (!persisted) {
                        return { ok: false, reason: 'CONFLICT' };
                    }

                    return {
                        ok: true,
                        questionIds: computed.bag.questionIds,
                        cycleNumber: computed.bag.nextState.cycleNumber,
                        didReshuffle: computed.bag.didReshuffle,
                    };
                },
                { debugLabel: 'quiz.cycle.draw' },
            );

            if (!result.ok && result.reason === 'CONFLICT') {
                continue;
            }

            return result;
        } catch (error) {
            // UPDATE мог успеть на Neon, а сокет умер на teardown — не списываем впустую.
            if (isTransientDirectPgError(error) && pendingDraw) {
                const applied = await verifyCycleStateApplied(
                    input.userId,
                    input.difficulty,
                    pendingDraw.nextState,
                );

                if (applied) {
                    return {
                        ok: true,
                        questionIds: pendingDraw.questionIds,
                        cycleNumber: pendingDraw.nextState.cycleNumber,
                        didReshuffle: pendingDraw.didReshuffle,
                    };
                }
            }

            throw error;
        }
    }

    throw new Error('UserQuestionCycle optimistic draw failed after 3 attempts');
}

/**
 * Mix = compute на pooled (как SINGLE load), persist на СВЕЖЕМ pooled client.
 * Fat SELECT id + UPDATE на одном сокете на mix 10 рвал persist ~19s.
 * NOT_ENOUGH до любого UPDATE. Не Direct queue.
 */
async function drawMixedQuestionIdsOnce(input: {
    userId: string;
    draws: Array<{ difficulty: Difficulty; needed: number }>;
}): Promise<DrawMixedUserQuestionCycleIdsResult> {
    const activeDraws = input.draws.filter((draw) => draw.needed > 0);

    if (activeDraws.length === 0) {
        return { ok: true, questionIds: [] };
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const prepared: PreparedBagDraw[] = [];

        for (const draw of activeDraws) {
            const computed = await withPooledPgClient(
                (client) =>
                    computeBagDrawOnClient(client, {
                        userId: input.userId,
                        difficulty: draw.difficulty,
                        needed: draw.needed,
                    }),
                { debugLabel: 'quiz.cycle.draw' },
            );

            if (!computed.ok) {
                return { ok: false, reason: computed.reason };
            }

            prepared.push({
                difficulty: draw.difficulty,
                ...computed.bag,
            });
        }

        const questionIds: string[] = [];
        let conflict = false;

        for (const bag of prepared) {
            try {
                const persisted = await withPooledPgClient(
                    (client) =>
                        persistCycleState(
                            client,
                            input.userId,
                            bag.difficulty,
                            bag.expected,
                            bag.nextState,
                        ),
                    { debugLabel: 'quiz.cycle.persist' },
                );

                if (!persisted) {
                    conflict = true;
                    break;
                }

                questionIds.push(...bag.questionIds);
            } catch (error) {
                if (isTransientDirectPgError(error)) {
                    const applied = await verifyCycleStateApplied(
                        input.userId,
                        bag.difficulty,
                        bag.nextState,
                    );

                    if (applied) {
                        questionIds.push(...bag.questionIds);
                        continue;
                    }
                }

                throw error;
            }
        }

        if (conflict) {
            continue;
        }

        return { ok: true, questionIds };
    }

    throw new Error(
        'UserQuestionCycle mixed optimistic persist failed after 3 attempts',
    );
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

    /**
     * Mix: три pooled SINGLE-hop (EASY→MEDIUM→HARD). Shuffle сессии — в pick.
     */
    async drawMixedQuestionIds(
        input: DrawMixedUserQuestionCycleIdsInput,
    ): Promise<DrawMixedUserQuestionCycleIdsResult> {
        return drawMixedQuestionIdsOnce(input);
    },
};
