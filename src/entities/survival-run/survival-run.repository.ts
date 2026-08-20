/**
 * SurvivalRun: scalar start-prep + wave 2+ after-complete (pooled, без JSONB).
 *
 * - begin: abandon чужие Survival → INSERT run (волна 1, totalScore=0)
 * - continue: abandon чужие runs/sessions, НЕ этот runId
 * - recordWaveAfterComplete: bank T0' + seen ids + waveIndex + totalScore
 *   → COMPLETED если bank=0 или unseen=0
 *
 * Не звать с того же клиента, что snapshot INSERT.
 * Не трогать Classic / Blitz / Daily.
 * Canon: docs/DECISIONS.md → Survival Mode MVP; QUIZ_NEON_HOT_PATH.md.
 */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import { withPooledPgClient } from '@/lib/db/direct-pg';
import {
    resolveSurvivalWaveQuestionCount,
    SURVIVAL_MODE_MVP_RULES,
    type SurvivalContinueBlockReason,
    type SurvivalDifficulty,
    type SurvivalNextWaveEligibility,
} from '@/features/survival-mode/types';
import type { Difficulty } from '@/types';

const SURVIVAL_START_POOLED_ATTEMPT_MS = 18_000;
/** Pooled after-complete: не Direct queue. 12s на cold Neon клинил record → нет continue. */
const SURVIVAL_AFTER_COMPLETE_POOLED_MS = 18_000;

export type BeginSurvivalRunInput = {
    userId: string;
    difficulty: Difficulty;
};

export type BeginSurvivalRunResult = {
    runId: string;
    waveIndex: 1;
    startedAt: Date;
    initialBankSeconds: number;
    seenQuestionIds: string[];
};

export type ContinueSurvivalRunInput = {
    userId: string;
    runId: string;
};

export type ContinueSurvivalRunResult =
    | {
          ok: true;
          runId: string;
          waveIndex: number;
          difficulty: SurvivalDifficulty;
          initialBankSeconds: number;
          seenQuestionIds: string[];
          remainingUnseen: number;
          questionCount: number;
      }
    | { ok: false; reason: 'SURVIVAL_CANNOT_CONTINUE' };

export type RecordSurvivalWaveAfterCompleteInput = {
    runId: string;
    userId: string;
    questionIds: string[];
    bankRemainingSeconds: number;
    waveScore: number;
    clockOk: boolean;
};

export type RecordSurvivalWaveAfterCompleteResult = {
    remainingUnseen: number;
    runCompleted: boolean;
    totalScore: number;
    bankRemainingSeconds: number;
};

type SurvivalRunRow = {
    id: string;
    user_id: string;
    difficulty: string;
    status: string;
    current_wave_index: number;
    bank_remaining_seconds: number | null;
    total_score: number;
};

/**
 * Только Survival-сессии этого user. Blitz/Classic/Daily не входят.
 * `exceptRunId`: при continue не трогаем чужие дискриминаторы, но
 * orphan IN_PROGRESS-сессии **этого** run тоже ABANDONED (перед новой волной).
 */
async function abandonInProgressSurvivalSessionsOnClient(
    client: Client,
    userId: string,
): Promise<number> {
    const result = await client.query(
        `
            UPDATE "QuizSession"
            SET "status" = 'ABANDONED'::"QuizSessionStatus"
            WHERE
                "userId" = $1
                AND "status" = 'IN_PROGRESS'::"QuizSessionStatus"
                AND "survivalRunId" IS NOT NULL
                AND "timedEndsAt" IS NULL
                AND "dailyChallengeId" IS NULL
        `,
        [userId],
    );

    return result.rowCount ?? 0;
}

/** IN_PROGRESS runs; `exceptRunId` сохраняет текущий забег при continue. */
async function abandonInProgressSurvivalRunsOnClient(
    client: Client,
    userId: string,
    exceptRunId?: string,
): Promise<number> {
    if (exceptRunId) {
        const result = await client.query(
            `
                UPDATE "SurvivalRun"
                SET "status" = 'ABANDONED'::"QuizSessionStatus"
                WHERE
                    "userId" = $1
                    AND "status" = 'IN_PROGRESS'::"QuizSessionStatus"
                    AND "id" <> $2
            `,
            [userId, exceptRunId],
        );

        return result.rowCount ?? 0;
    }

    const result = await client.query(
        `
            UPDATE "SurvivalRun"
            SET "status" = 'ABANDONED'::"QuizSessionStatus"
            WHERE
                "userId" = $1
                AND "status" = 'IN_PROGRESS'::"QuizSessionStatus"
        `,
        [userId],
    );

    return result.rowCount ?? 0;
}

async function loadSurvivalRunRow(
    client: Client,
    runId: string,
    userId: string,
): Promise<SurvivalRunRow | null> {
    const result = await client.query<SurvivalRunRow>(
        `
            SELECT
                "id",
                "userId" AS user_id,
                "difficulty"::text AS difficulty,
                "status"::text AS status,
                "currentWaveIndex" AS current_wave_index,
                "bankRemainingSeconds" AS bank_remaining_seconds,
                "totalScore" AS total_score
            FROM "SurvivalRun"
            WHERE "id" = $1 AND "userId" = $2
            LIMIT 1
        `,
        [runId, userId],
    );

    return result.rows[0] ?? null;
}

async function listSeenQuestionIdsOnClient(
    client: Client,
    runId: string,
): Promise<string[]> {
    const result = await client.query<{ question_id: string }>(
        `
            SELECT "questionId" AS question_id
            FROM "SurvivalRunSeenQuestion"
            WHERE "runId" = $1
        `,
        [runId],
    );

    return result.rows.map((row) => row.question_id);
}

async function countUnseenPublishedOnClient(
    client: Client,
    runId: string,
    difficulty: Difficulty,
): Promise<number> {
    const result = await client.query<{ remaining: number }>(
        `
            SELECT COUNT(*)::int AS remaining
            FROM "Question" q
            WHERE
                q."difficulty" = $1::"Difficulty"
                AND q."isActive" = true
                AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
                AND NOT EXISTS (
                    SELECT 1
                    FROM "SurvivalRunSeenQuestion" seen
                    WHERE
                        seen."runId" = $2
                        AND seen."questionId" = q."id"
                )
        `,
        [difficulty, runId],
    );

    return result.rows[0]?.remaining ?? 0;
}

function parseSurvivalDifficulty(
    value: string,
): SurvivalDifficulty | null {
    if (value === 'EASY' || value === 'MEDIUM' || value === 'HARD') {
        return value;
    }

    return null;
}

function resolveContinueBlockReason(args: {
    clockOk: boolean;
    bankRemainingSeconds: number;
    remainingUnseen: number;
}): SurvivalContinueBlockReason | null {
    if (!args.clockOk) {
        return 'clock_cut';
    }

    if (args.bankRemainingSeconds <= 0) {
        return 'bank_empty';
    }

    if (args.remainingUnseen <= 0) {
        return 'pool_exhausted';
    }

    return null;
}

/**
 * Один pooled client: abandon → INSERT волны 1.
 * `startedAt` = JS Date после connect, не SQL NOW() в naive TIMESTAMP.
 */
export async function beginSurvivalRunForUser(
    input: BeginSurvivalRunInput,
): Promise<BeginSurvivalRunResult> {
    return withPooledPgClient(
        async (client) => {
            try {
                await abandonInProgressSurvivalSessionsOnClient(
                    client,
                    input.userId,
                );
                await abandonInProgressSurvivalRunsOnClient(
                    client,
                    input.userId,
                );
            } catch (error) {
                console.warn('Survival abandon skipped:', error);
            }

            const runId = randomUUID();
            const waveIndex = 1 as const;
            const startedAt = new Date();
            const initialBankSeconds =
                SURVIVAL_MODE_MVP_RULES.initialBankSeconds;

            await client.query(
                `
                    INSERT INTO "SurvivalRun" (
                        "id",
                        "userId",
                        "difficulty",
                        "status",
                        "currentWaveIndex",
                        "startedAt",
                        "completedAt",
                        "bankRemainingSeconds",
                        "totalScore"
                    )
                    VALUES (
                        $1,
                        $2,
                        $3::"Difficulty",
                        $4::"QuizSessionStatus",
                        $5,
                        $6,
                        NULL,
                        NULL,
                        0
                    )
                `,
                [
                    runId,
                    input.userId,
                    input.difficulty,
                    'IN_PROGRESS',
                    waveIndex,
                    startedAt,
                ],
            );

            return {
                runId,
                waveIndex,
                startedAt,
                initialBankSeconds,
                seenQuestionIds: [],
            };
        },
        {
            debugLabel: 'survival.start.begin',
            attemptTimeoutMs: SURVIVAL_START_POOLED_ATTEMPT_MS,
        },
    );
}

/**
 * Continue того же run: не kill runId; orphan Survival sessions abandon;
 * чужие IN_PROGRESS runs abandon.
 */
export async function continueSurvivalRunForUser(
    input: ContinueSurvivalRunInput,
): Promise<ContinueSurvivalRunResult> {
    return withPooledPgClient(
        async (client) => {
            try {
                await abandonInProgressSurvivalSessionsOnClient(
                    client,
                    input.userId,
                );
                await abandonInProgressSurvivalRunsOnClient(
                    client,
                    input.userId,
                    input.runId,
                );
            } catch (error) {
                console.warn('Survival continue abandon skipped:', error);
            }

            const run = await loadSurvivalRunRow(
                client,
                input.runId,
                input.userId,
            );
            const difficulty = run
                ? parseSurvivalDifficulty(run.difficulty)
                : null;

            if (
                !run ||
                !difficulty ||
                run.status !== 'IN_PROGRESS' ||
                run.bank_remaining_seconds == null ||
                run.bank_remaining_seconds <= 0
            ) {
                return { ok: false, reason: 'SURVIVAL_CANNOT_CONTINUE' };
            }

            const seenQuestionIds = await listSeenQuestionIdsOnClient(
                client,
                run.id,
            );
            const remainingUnseen = await countUnseenPublishedOnClient(
                client,
                run.id,
                difficulty,
            );
            const questionCount =
                resolveSurvivalWaveQuestionCount(remainingUnseen);

            if (questionCount <= 0) {
                return { ok: false, reason: 'SURVIVAL_CANNOT_CONTINUE' };
            }

            return {
                ok: true,
                runId: run.id,
                waveIndex: run.current_wave_index,
                difficulty,
                initialBankSeconds: run.bank_remaining_seconds,
                seenQuestionIds,
                remainingUnseen,
                questionCount,
            };
        },
        {
            debugLabel: 'survival.start.continue',
            attemptTimeoutMs: SURVIVAL_START_POOLED_ATTEMPT_MS,
        },
    );
}

/**
 * Pooled after successful complete: seen + bank + waveIndex + totalScore.
 * Мало hop'ов на одном клиенте (cold Neon). Не звать из completeWithResult.
 */
export async function recordSurvivalWaveAfterComplete(
    input: RecordSurvivalWaveAfterCompleteInput,
): Promise<RecordSurvivalWaveAfterCompleteResult> {
    return withPooledPgClient(
        async (client) => {
            const uniqueQuestionIds = Array.from(
                new Set(input.questionIds.filter((id) => id.length > 0)),
            );
            const scoreDelta =
                input.clockOk && input.waveScore > 0 ? input.waveScore : 0;
            const bankRemainingSeconds = Math.max(
                0,
                Math.floor(input.bankRemainingSeconds),
            );

            const stateResult = await client.query<{
                id: string;
                difficulty: string;
                status: string;
                total_score: number;
                bank_remaining_seconds: number | null;
                already_seen_n: number;
                incoming_n: number;
            }>(
                `
                    SELECT
                        r."id",
                        r."difficulty"::text AS difficulty,
                        r."status"::text AS status,
                        r."totalScore" AS total_score,
                        r."bankRemainingSeconds" AS bank_remaining_seconds,
                        (
                            SELECT COUNT(*)::int
                            FROM unnest($3::text[]) AS qid(id)
                            WHERE EXISTS (
                                SELECT 1
                                FROM "SurvivalRunSeenQuestion" seen
                                WHERE
                                    seen."runId" = r."id"
                                    AND seen."questionId" = qid.id
                            )
                        ) AS already_seen_n,
                        CARDINALITY($3::text[]) AS incoming_n
                    FROM "SurvivalRun" r
                    WHERE
                        r."id" = $1
                        AND r."userId" = $2
                    LIMIT 1
                `,
                [input.runId, input.userId, uniqueQuestionIds],
            );

            const run = stateResult.rows[0];
            const difficulty = run
                ? parseSurvivalDifficulty(run.difficulty)
                : null;

            if (!run || !difficulty || run.status !== 'IN_PROGRESS') {
                return {
                    remainingUnseen: 0,
                    runCompleted: true,
                    totalScore: run?.total_score ?? 0,
                    bankRemainingSeconds: 0,
                };
            }

            // Idempotent: волна уже записана — не двойной totalScore.
            if (
                run.incoming_n > 0 &&
                run.already_seen_n >= run.incoming_n
            ) {
                const remainingUnseen = await countUnseenPublishedOnClient(
                    client,
                    input.runId,
                    difficulty,
                );
                return {
                    remainingUnseen,
                    runCompleted: false,
                    totalScore: run.total_score,
                    bankRemainingSeconds:
                        run.bank_remaining_seconds ?? 0,
                };
            }

            if (uniqueQuestionIds.length > 0) {
                await client.query(
                    `
                        INSERT INTO "SurvivalRunSeenQuestion" ("runId", "questionId")
                        SELECT $1, qid.id
                        FROM unnest($2::text[]) AS qid(id)
                        ON CONFLICT ("runId", "questionId") DO NOTHING
                    `,
                    [input.runId, uniqueQuestionIds],
                );
            }

            const updated = await client.query<{
                total_score: number;
                bank_remaining_seconds: number;
                remaining_unseen: number;
                run_completed: boolean;
            }>(
                `
                    WITH bumped AS (
                        UPDATE "SurvivalRun" AS sr
                        SET
                            "bankRemainingSeconds" = $2,
                            "currentWaveIndex" = sr."currentWaveIndex" + 1,
                            "totalScore" = sr."totalScore" + $3
                        WHERE
                            sr."id" = $1
                            AND sr."userId" = $4
                            AND sr."status" = 'IN_PROGRESS'::"QuizSessionStatus"
                        RETURNING
                            sr."id",
                            sr."difficulty",
                            sr."totalScore",
                            sr."bankRemainingSeconds"
                    ),
                    remaining AS (
                        SELECT COUNT(*)::int AS n
                        FROM "Question" q
                        INNER JOIN bumped b ON TRUE
                        WHERE
                            q."difficulty" = b."difficulty"
                            AND q."isActive" = true
                            AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
                            AND NOT EXISTS (
                                SELECT 1
                                FROM "SurvivalRunSeenQuestion" seen
                                WHERE
                                    seen."runId" = b."id"
                                    AND seen."questionId" = q."id"
                            )
                    ),
                    finished AS (
                        UPDATE "SurvivalRun" AS sr
                        SET
                            "status" = 'COMPLETED'::"QuizSessionStatus",
                            "completedAt" = $5
                        FROM bumped b, remaining rem
                        WHERE
                            sr."id" = b."id"
                            AND sr."status" = 'IN_PROGRESS'::"QuizSessionStatus"
                            AND (
                                b."bankRemainingSeconds" <= 0
                                OR rem.n <= 0
                            )
                        RETURNING sr."id"
                    )
                    SELECT
                        b."totalScore" AS total_score,
                        b."bankRemainingSeconds" AS bank_remaining_seconds,
                        rem.n AS remaining_unseen,
                        EXISTS (SELECT 1 FROM finished) AS run_completed
                    FROM bumped b
                    CROSS JOIN remaining rem
                `,
                [
                    input.runId,
                    bankRemainingSeconds,
                    scoreDelta,
                    input.userId,
                    new Date(),
                ],
            );

            const row = updated.rows[0];

            if (!row) {
                return {
                    remainingUnseen: 0,
                    runCompleted: true,
                    totalScore: run.total_score,
                    bankRemainingSeconds,
                };
            }

            return {
                remainingUnseen: row.remaining_unseen,
                runCompleted: row.run_completed,
                totalScore: row.total_score,
                bankRemainingSeconds: row.bank_remaining_seconds,
            };
        },
        {
            debugLabel: 'survival.after-complete.record-wave',
            attemptTimeoutMs: SURVIVAL_AFTER_COMPLETE_POOLED_MS,
        },
    );
}

/**
 * Gate CTA «Следующая волна» на result (серверные скаляры).
 */
export async function findSurvivalNextWaveEligibilityForUser(
    runId: string,
    userId: string,
    clockOk: boolean,
): Promise<SurvivalNextWaveEligibility | null> {
    return withPooledPgClient(
        async (client) => {
            const run = await loadSurvivalRunRow(client, runId, userId);
            const difficulty = run
                ? parseSurvivalDifficulty(run.difficulty)
                : null;

            if (!run || !difficulty) {
                return null;
            }

            const bankRemainingSeconds = run.bank_remaining_seconds ?? 0;
            const remainingUnseen =
                run.status === 'IN_PROGRESS'
                    ? await countUnseenPublishedOnClient(
                          client,
                          run.id,
                          difficulty,
                      )
                    : 0;
            const blockReason = resolveContinueBlockReason({
                clockOk,
                bankRemainingSeconds,
                remainingUnseen,
            });
            const canContinue =
                run.status === 'IN_PROGRESS' && blockReason == null;
            const nextWaveQuestionCount = canContinue
                ? resolveSurvivalWaveQuestionCount(remainingUnseen)
                : 0;

            return {
                canContinue,
                runId: run.id,
                nextWaveIndex: run.current_wave_index,
                bankRemainingSeconds: canContinue
                    ? bankRemainingSeconds
                    : null,
                clockOk,
                remainingUnseen,
                nextWaveQuestionCount,
                blockReason: canContinue ? null : blockReason ?? 'bank_empty',
            };
        },
        {
            debugLabel: 'survival.result.next-wave-eligibility',
            attemptTimeoutMs: 8_000,
        },
    );
}

/** Скаляры run для play-load / submit (initialBankSeconds). */
export async function findSurvivalRunBankSecondsForUser(
    runId: string,
    userId: string,
): Promise<number | null> {
    return withPooledPgClient(
        async (client) => {
            const run = await loadSurvivalRunRow(client, runId, userId);

            if (!run) {
                return null;
            }

            if (
                run.bank_remaining_seconds != null &&
                run.bank_remaining_seconds > 0
            ) {
                return run.bank_remaining_seconds;
            }

            // Волна 1 до after-complete: bank NULL → T0.
            if (run.current_wave_index <= 1) {
                return SURVIVAL_MODE_MVP_RULES.initialBankSeconds;
            }

            return run.bank_remaining_seconds ?? 0;
        },
        {
            debugLabel: 'survival.run.bank-seconds',
            attemptTimeoutMs: 5_000,
        },
    );
}

export const survivalRunRepository = {
    beginSurvivalRunForUser,
    continueSurvivalRunForUser,
    recordSurvivalWaveAfterComplete,
    findSurvivalNextWaveEligibilityForUser,
    findSurvivalRunBankSecondsForUser,
};
