/**
 * Persist / draw UserQuestionCycle (seeded cursor anti-repeat).
 *
 * Senior fix (Aug 12):
 * - Скаляры cycleSeed/cursor/poolSize (не JSONB remainingIds).
 * - НЕ Prisma: pooled adapter на Windows+Neon часто рвёт сокет после COMMIT
 *   → ложный DB_TIMEOUT, хотя UPDATE уже прошёл.
 * - Raw `pg` через `withPooledPgClient` (DATABASE_URL), ВНЕ Direct quiz queue:
 *   cycle на Direct клинил start/home/submit (история A).
 * - Один client, 2–3 autocommit query; optimistic UPDATE.
 * - Pooled hop имеет wall timeout (12s): без него cycle.draw на больном Neon
 *   держал Survival lobby 63s+. Transient после abort → verify nextState
 *   (как quiz write recovery). Не путать с Prisma Promise.race, который
 *   false-fail после успешного COMMIT.
 * - Transient после UPDATE → verify nextState (как quiz write recovery).
 *
 * Мешок темы (`topicTagId`): та же механика в `UserTopicQuestionCycle`, пул —
 * вопросы с меткой темы или её детьми, на том же pooled hop (не новый hop).
 * Без темы SQL и порядок запросов прежние. Пул темы меньше
 * PLAY_TOPIC_MIN_QUESTIONS → NOT_ENOUGH до создания строки мешка.
 * Canon: docs/DECISIONS.md → Play topics.
 *
 * Mix (Classic/Blitz): compute на pooled, persist на свежем pooled (не тот же
 * сокет после fat SELECT). Не BEGIN. Не `withDirectPg*`.
 * После cycle — 300ms settle перед Direct resolve (очередь так же ждёт 300ms).
 * Daily / submit не вызывают.
 */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import { PLAY_TOPIC_MIN_QUESTIONS } from '@/entities/play-topic/play-topic';
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

export type DrawQuestionIdsInput = {
    userId: string;
    difficulty: Difficulty;
    needed: number;
    /** Тема игры (id метки): свой мешок на (игрок, тема, сложность). */
    topicTagId?: string | null;
    /** Survival: сыгранные в забеге id не выдаются (без повторов в забеге). */
    excludeQuestionIds?: readonly string[];
    /** Survival: последняя волна может быть короче `needed`. */
    allowPartial?: boolean;
};

export type DrawMixedUserQuestionCycleIdsInput = {
    userId: string;
    /** Тема игры: все три куска Микса берутся из мешков этой темы. */
    topicTagId?: string | null;
    /** Последовательные куски сплита (EASY → MEDIUM → HARD). Не MIXED-мешок. */
    draws: Array<{ difficulty: Difficulty; needed: number }>;
};

export type DrawMixedUserQuestionCycleIdsResult =
    | { ok: true; questionIds: string[] }
    | { ok: false; reason: 'NOT_ENOUGH_QUESTIONS' };

/**
 * Wall budget pooled cycle hop. Без лимита Survival lobby ловил cycle.draw ~63s
 * (phase=operation). Не глобальный Direct 18s. Abort → verify nextState.
 */
const CYCLE_POOLED_ATTEMPT_MS = 12_000;

/** Какой мешок: общий на сложность (topicTagId null) или мешок темы. */
type CycleBagKey = {
    userId: string;
    difficulty: Difficulty;
    topicTagId: string | null;
};

function toBagKey(input: {
    userId: string;
    difficulty: Difficulty;
    topicTagId?: string | null;
}): CycleBagKey {
    return {
        userId: input.userId,
        difficulty: input.difficulty,
        topicTagId: input.topicTagId ?? null,
    };
}

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

async function loadTopicCycleState(
    client: Client,
    userId: string,
    topicTagId: string,
    difficulty: Difficulty,
): Promise<QuestionCycleState | null> {
    const result = await client.query<CycleStateRow>(
        `
            SELECT
                "cycleNumber" AS cycle_number,
                "cycleSeed" AS cycle_seed,
                "cursor",
                "poolSize" AS pool_size
            FROM "UserTopicQuestionCycle"
            WHERE "userId" = $1
              AND "tagId" = $2
              AND "difficulty" = $3::"Difficulty"
            LIMIT 1
        `,
        [userId, topicTagId, difficulty],
    );

    const row = result.rows[0];
    return row ? rowToState(row) : null;
}

function loadBagState(
    client: Client,
    bag: CycleBagKey,
): Promise<QuestionCycleState | null> {
    return bag.topicTagId
        ? loadTopicCycleState(client, bag.userId, bag.topicTagId, bag.difficulty)
        : loadCycleState(client, bag.userId, bag.difficulty);
}

async function insertBagState(client: Client, bag: CycleBagKey): Promise<void> {
    if (bag.topicTagId) {
        await client.query(
            `
                INSERT INTO "UserTopicQuestionCycle" (
                    "id",
                    "userId",
                    "tagId",
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
                    $3,
                    $4::"Difficulty",
                    0,
                    0,
                    0,
                    0,
                    NOW(),
                    NOW()
                )
                ON CONFLICT ("userId", "tagId", "difficulty") DO NOTHING
            `,
            [randomUUID(), bag.userId, bag.topicTagId, bag.difficulty],
        );
        return;
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
        [randomUUID(), bag.userId, bag.difficulty],
    );
}

async function loadOrCreateCycleState(
    client: Client,
    bag: CycleBagKey,
): Promise<QuestionCycleState> {
    const existing = await loadBagState(client, bag);

    if (existing) {
        return existing;
    }

    await insertBagState(client, bag);

    const created = await loadBagState(client, bag);

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
 * Пул темы: метка темы или её дети (семейство Nintendo → Switch, NES…).
 * Метка без `playOrder` (не тема) даёт пустой пул — так сервер не доверяет
 * присланному id. EXISTS идёт по PK QuestionTag (questionId, tagId).
 */
async function loadTopicPoolIds(
    client: Client,
    difficulty: Difficulty,
    topicTagId: string,
): Promise<string[]> {
    const result = await client.query<{ id: string }>(
        `
            SELECT q."id"
            FROM "Question" q
            WHERE
                q."difficulty" = $1::"Difficulty"
                AND q."isActive" = true
                AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
                AND EXISTS (
                    SELECT 1
                    FROM "Tag" topic
                    WHERE topic."id" = $2
                      AND topic."playOrder" IS NOT NULL
                )
                AND EXISTS (
                    SELECT 1
                    FROM "QuestionTag" qt
                    JOIN "Tag" t ON t."id" = qt."tagId"
                    WHERE qt."questionId" = q."id"
                      AND (t."id" = $2 OR t."parentId" = $2)
                )
        `,
        [difficulty, topicTagId],
    );

    return result.rows.map((row) => row.id);
}

/**
 * Optimistic scalar UPDATE. true = наша версия; false = конфликт (retry draw).
 */
async function persistCycleState(
    client: Client,
    bag: CycleBagKey,
    expected: QuestionCycleState,
    next: QuestionCycleState,
): Promise<boolean> {
    const stateParams = [
        next.cycleNumber,
        next.cycleSeed,
        next.cursor,
        next.poolSize,
        expected.cycleNumber,
        expected.cycleSeed,
        expected.cursor,
        expected.poolSize,
    ];

    if (bag.topicTagId) {
        const result = await client.query(
            `
                UPDATE "UserTopicQuestionCycle"
                SET
                    "cycleNumber" = $4,
                    "cycleSeed" = $5,
                    "cursor" = $6,
                    "poolSize" = $7,
                    "updatedAt" = NOW()
                WHERE
                    "userId" = $1
                    AND "tagId" = $2
                    AND "difficulty" = $3::"Difficulty"
                    AND "cycleNumber" = $8
                    AND "cycleSeed" = $9
                    AND "cursor" = $10
                    AND "poolSize" = $11
            `,
            [bag.userId, bag.topicTagId, bag.difficulty, ...stateParams],
        );

        return (result.rowCount ?? 0) > 0;
    }

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
        [bag.userId, bag.difficulty, ...stateParams],
    );

    return (result.rowCount ?? 0) > 0;
}

async function verifyCycleStateApplied(
    bag: CycleBagKey,
    expectedNext: QuestionCycleState,
): Promise<boolean> {
    try {
        const current = await withPooledPgClient(
            (client) => loadBagState(client, bag),
            { debugLabel: 'quiz.cycle.verify', attemptTimeoutMs: CYCLE_POOLED_ATTEMPT_MS },
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
    bag: CycleBagKey;
    questionIds: string[];
    expected: QuestionCycleState;
    nextState: QuestionCycleState;
    didReshuffle: boolean;
};

type ComputedBagDraw =
    | { ok: true; bag: Omit<PreparedBagDraw, 'bag'> }
    | { ok: false; reason: 'NOT_ENOUGH_QUESTIONS' };

function drawOnPool(
    input: DrawQuestionIdsInput,
    state: QuestionCycleState,
    poolIds: readonly string[],
): ComputedBagDraw {
    const drawn = drawFromSeededCycle({
        state,
        poolIds,
        needed: input.needed,
        excludeIds: input.excludeQuestionIds,
        allowPartial: input.allowPartial,
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

/**
 * Load + seeded draw, без UPDATE. Mix persist'ит на свежем pooled client:
 * fat SELECT id и UPDATE на одном сокете (mix 10) висели ~19s.
 */
async function computeBagDrawOnClient(
    client: Client,
    input: DrawQuestionIdsInput,
): Promise<ComputedBagDraw> {
    const bag = toBagKey(input);

    if (bag.topicTagId) {
        // Сначала пул: на неизвестной или узкой теме строку мешка не создаём.
        const poolIds = await loadTopicPoolIds(
            client,
            input.difficulty,
            bag.topicTagId,
        );

        if (poolIds.length < PLAY_TOPIC_MIN_QUESTIONS) {
            return { ok: false, reason: 'NOT_ENOUGH_QUESTIONS' };
        }

        const state = await loadOrCreateCycleState(client, bag);
        return drawOnPool(input, state, poolIds);
    }

    const state = await loadOrCreateCycleState(client, bag);
    const poolIds = await loadActivePublishedPoolIds(client, input.difficulty);

    return drawOnPool(input, state, poolIds);
}

async function drawQuestionIdsOnce(
    input: DrawQuestionIdsInput,
): Promise<DrawUserQuestionCycleIdsResult> {
    const bag = toBagKey(input);

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
                        bag,
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
                { debugLabel: 'quiz.cycle.draw', attemptTimeoutMs: CYCLE_POOLED_ATTEMPT_MS },
            );

            if (!result.ok && result.reason === 'CONFLICT') {
                continue;
            }

            return result;
        } catch (error) {
            // UPDATE мог успеть на Neon, а сокет умер на teardown — не списываем впустую.
            if (isTransientDirectPgError(error) && pendingDraw) {
                const applied = await verifyCycleStateApplied(
                    bag,
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
async function drawMixedQuestionIdsOnce(
    input: DrawMixedUserQuestionCycleIdsInput,
): Promise<DrawMixedUserQuestionCycleIdsResult> {
    const activeDraws = input.draws.filter((draw) => draw.needed > 0);

    if (activeDraws.length === 0) {
        return { ok: true, questionIds: [] };
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const prepared: PreparedBagDraw[] = [];

        for (const draw of activeDraws) {
            const drawInput: DrawQuestionIdsInput = {
                userId: input.userId,
                difficulty: draw.difficulty,
                needed: draw.needed,
                topicTagId: input.topicTagId,
            };
            const computed = await withPooledPgClient(
                (client) => computeBagDrawOnClient(client, drawInput),
                { debugLabel: 'quiz.cycle.draw', attemptTimeoutMs: CYCLE_POOLED_ATTEMPT_MS },
            );

            if (!computed.ok) {
                return { ok: false, reason: computed.reason };
            }

            prepared.push({
                bag: toBagKey(drawInput),
                ...computed.bag,
            });
        }

        const questionIds: string[] = [];
        let conflict = false;

        for (const prepare of prepared) {
            try {
                const persisted = await withPooledPgClient(
                    (client) =>
                        persistCycleState(
                            client,
                            prepare.bag,
                            prepare.expected,
                            prepare.nextState,
                        ),
                    { debugLabel: 'quiz.cycle.persist', attemptTimeoutMs: CYCLE_POOLED_ATTEMPT_MS },
                );

                if (!persisted) {
                    conflict = true;
                    break;
                }

                questionIds.push(...prepare.questionIds);
            } catch (error) {
                if (isTransientDirectPgError(error)) {
                    const applied = await verifyCycleStateApplied(
                        prepare.bag,
                        prepare.nextState,
                    );

                    if (applied) {
                        questionIds.push(...prepare.questionIds);
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
     * Classic/Timed start и волны Survival — один цикл на сложность, поэтому
     * вопрос не повторяется ни в одном режиме до конца цикла.
     * С темой — мешок темы (Survival тему не передаёт).
     * Без budget-race и без JSONB мешка.
     */
    async drawQuestionIds(
        input: DrawQuestionIdsInput,
    ): Promise<DrawUserQuestionCycleIdsResult> {
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
