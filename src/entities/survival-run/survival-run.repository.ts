/**
 * SurvivalRun: scalar start-prep (abandon + INSERT), без JSONB и без Direct.
 *
 * Зачем отдельный entity: QuizSession Survival JSONB — отдельный pooled
 * hop после pick (не этот клиент, не Direct). Run = scalars до pick.
 * Orphan run без сессии допустим — следующий старт ставит ABANDONED.
 *
 * Не звать с того же клиента, что snapshot INSERT.
 * Не трогать Classic (`survivalRunId IS NULL`), Blitz (`timedEndsAt`), Daily.
 * Canon: docs/DECISIONS.md → Survival Mode MVP; QUIZ_NEON_HOT_PATH.md.
 */

import { randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import { withPooledPgClient } from '@/lib/db/direct-pg';
import type { Difficulty } from '@/types';

const SURVIVAL_START_POOLED_ATTEMPT_MS = 18_000;

export type BeginSurvivalRunInput = {
    userId: string;
    difficulty: Difficulty;
};

export type BeginSurvivalRunResult = {
    runId: string;
    waveIndex: 1;
    startedAt: Date;
};

/**
 * Только Survival-сессии этого user. Blitz/Classic/Daily не входят:
 * `survivalRunId IS NOT NULL` + оба чужих дискриминатора NULL.
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

/** IN_PROGRESS runs, включая orphan без сессии. */
async function abandonInProgressSurvivalRunsOnClient(
    client: Client,
    userId: string,
): Promise<number> {
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
                        "bankRemainingSeconds"
                    )
                    VALUES (
                        $1,
                        $2,
                        $3::"Difficulty",
                        $4::"QuizSessionStatus",
                        $5,
                        $6,
                        NULL,
                        NULL
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

            return { runId, waveIndex, startedAt };
        },
        {
            debugLabel: 'survival.start.begin',
            attemptTimeoutMs: SURVIVAL_START_POOLED_ATTEMPT_MS,
        },
    );
}

export const survivalRunRepository = {
    beginSurvivalRunForUser,
};
