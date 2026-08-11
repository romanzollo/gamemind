/**
 * Persist / read UserAchievement unlock rows (Achievements MVP, variant A).
 *
 * Зачем entity-слой:
 * - SQL отдельно от evaluate (чистые правила) и от UI;
 * - не смешивать с quiz snapshot/submit write path — award вызывается после complete;
 * - каталога в БД нет: `code` = slug из ACHIEVEMENT_CATALOG.
 *
 * Canon: docs/DECISIONS.md → Achievements MVP + QUIZ_NEON_HOT_PATH
 * (profile/award hops не должны клинить Direct-очередь quiz start).
 */

import { randomUUID } from 'node:crypto';

import {
    withDirectPgClient,
    withDirectPgWriteClient,
} from '@/lib/db/direct-pg';
import type {
    AchievementCode,
    AchievementEvalFacts,
} from '@/features/achievements/types';

type EvalFactsRow = {
    quizzes_completed: number;
    perfect_count: number;
    daily_count: number;
    medium_count: number;
    hard_count: number;
    timed_count: number;
    classic_count: number;
    high_accuracy_90_count: number;
    total_score: number;
};

type UnlockRow = {
    code: string;
    unlocked_at: Date;
};

/**
 * Булевы once-флаги выводим из count — меньше aggregate в SQL,
 * тот же контракт AchievementEvalFacts для evaluate/progress.
 */
function mapEvalFactsRow(row: EvalFactsRow | undefined): AchievementEvalFacts {
    const perfectQuizCount = Number(row?.perfect_count ?? 0);
    const dailyCompletedCount = Number(row?.daily_count ?? 0);
    const mediumCompletedCount = Number(row?.medium_count ?? 0);
    const hardCompletedCount = Number(row?.hard_count ?? 0);
    const timedCount = Number(row?.timed_count ?? 0);
    const classicCount = Number(row?.classic_count ?? 0);
    const highAccuracy90Count = Number(row?.high_accuracy_90_count ?? 0);

    return {
        quizzesCompleted: Number(row?.quizzes_completed ?? 0),
        hasPerfectQuiz: perfectQuizCount > 0,
        perfectQuizCount,
        hasDailyCompleted: dailyCompletedCount > 0,
        dailyCompletedCount,
        hasMediumCompleted: mediumCompletedCount > 0,
        mediumCompletedCount,
        hasHardCompleted: hardCompletedCount > 0,
        hardCompletedCount,
        hasTimedCompleted: timedCount > 0,
        hasClassicCompleted: classicCount > 0,
        hasHighAccuracy90: highAccuracy90Count > 0,
        totalScore: Number(row?.total_score ?? 0),
    };
}

/**
 * Один SELECT: count-агрегаты для evaluate + progress UI.
 * Не на submit/complete hop — только award/profile (см. QUIZ_NEON_HOT_PATH).
 */
const EVAL_FACTS_SQL = `
    SELECT
        COUNT(r.id)::int AS quizzes_completed,
        COALESCE(
            COUNT(*) FILTER (
                WHERE
                    r."correctCount" = r."totalQuestions"
                    AND r."totalQuestions" > 0
            ),
            0
        )::int AS perfect_count,
        COALESCE(
            COUNT(*) FILTER (WHERE s."dailyChallengeId" IS NOT NULL),
            0
        )::int AS daily_count,
        COALESCE(
            COUNT(*) FILTER (WHERE s.difficulty = 'MEDIUM'),
            0
        )::int AS medium_count,
        COALESCE(
            COUNT(*) FILTER (WHERE s.difficulty = 'HARD'),
            0
        )::int AS hard_count,
        COALESCE(
            COUNT(*) FILTER (WHERE s."timedEndsAt" IS NOT NULL),
            0
        )::int AS timed_count,
        COALESCE(
            COUNT(*) FILTER (
                WHERE
                    s."dailyChallengeId" IS NULL
                    AND s."timedEndsAt" IS NULL
            ),
            0
        )::int AS classic_count,
        COALESCE(
            COUNT(*) FILTER (
                WHERE
                    r."totalQuestions" > 0
                    AND (100.0 * r."correctCount" / r."totalQuestions") >= 90
            ),
            0
        )::int AS high_accuracy_90_count,
        COALESCE(SUM(r.score), 0)::int AS total_score
    FROM "QuizResult" AS r
    INNER JOIN "QuizSession" AS s ON s.id = r."sessionId"
    WHERE r."userId" = $1
`;

/** Profile progress — короткий budget: лучше soft-miss, чем клинить quiz start. */
const PROGRESS_READ_TIMEOUT_MS = 8_000;

export const userAchievementRepository = {
    /**
     * Агрегаты для evaluateAchievements: один SELECT + JOIN Session.
     * Без GROUP BY aggregate всегда даёт 1 строку (COUNT=0, если результатов нет).
     */
    async findEvalFactsByUserId(userId: string): Promise<AchievementEvalFacts> {
        const result = await withDirectPgClient((client) =>
            client.query<EvalFactsRow>(EVAL_FACTS_SQL, [userId]),
        );

        return mapEvalFactsRow(result.rows[0]);
    },

    /**
     * Facts + уже unlock’нутые коды на ОДНОМ unpooled client.
     *
     * Не Promise.all двух withDirectPgClient: на Windows + next dev
     * параллельный fresh-Client TLS к Neon клинит сокет (см. direct-pg.ts),
     * после чего result page тоже ловит DirectPgTimeoutError.
     */
    async findAwardContextByUserId(userId: string): Promise<{
        facts: AchievementEvalFacts;
        unlockedCodes: string[];
    }> {
        return withDirectPgClient(async (client) => {
            const factsResult = await client.query<EvalFactsRow>(
                EVAL_FACTS_SQL,
                [userId],
            );
            const unlockResult = await client.query<{ code: string }>(
                `
                    SELECT code
                    FROM "UserAchievement"
                    WHERE "userId" = $1
                `,
                [userId],
            );

            return {
                facts: mapEvalFactsRow(factsResult.rows[0]),
                unlockedCodes: unlockResult.rows.map((row) => row.code),
            };
        });
    },

    /**
     * Unlock-строки с датой — для UI профиля и diff award.
     */
    async findUnlockRowsByUserId(
        userId: string,
    ): Promise<Array<{ code: string; unlockedAt: Date }>> {
        const result = await withDirectPgClient((client) =>
            client.query<UnlockRow>(
                `
                    SELECT code, "unlockedAt" AS unlocked_at
                    FROM "UserAchievement"
                    WHERE "userId" = $1
                `,
                [userId],
            ),
        );

        return result.rows.map((row) => ({
            code: row.code,
            unlockedAt: row.unlocked_at,
        }));
    },

    /**
     * Facts + unlock на одном unpooled client — только READ для UI профиля.
     * Без outbox/write: write award только на result Suspense (hot path canon).
     * Короткий timeout — soft-miss ачивок лучше, чем DB_TIMEOUT на quiz start.
     */
    async findProgressContextByUserId(userId: string): Promise<{
        facts: AchievementEvalFacts;
        unlockRows: Array<{ code: string; unlockedAt: Date }>;
    }> {
        return withDirectPgClient(
            async (client) => {
                const factsResult = await client.query<EvalFactsRow>(
                    EVAL_FACTS_SQL,
                    [userId],
                );
                const unlockResult = await client.query<UnlockRow>(
                    `
                        SELECT code, "unlockedAt" AS unlocked_at
                        FROM "UserAchievement"
                        WHERE "userId" = $1
                    `,
                    [userId],
                );

                return {
                    facts: mapEvalFactsRow(factsResult.rows[0]),
                    unlockRows: unlockResult.rows.map((row) => ({
                        code: row.code,
                        unlockedAt: row.unlocked_at,
                    })),
                };
            },
            {
                debugLabel: 'achievement.progress.context',
                attemptTimeoutMs: PROGRESS_READ_TIMEOUT_MS,
                maxAttempts: 1,
            },
        );
    },

    /** Уже сохранённые коды unlock (для diff с evaluate). */
    async findUnlockedCodesByUserId(userId: string): Promise<string[]> {
        const rows =
            await userAchievementRepository.findUnlockRowsByUserId(userId);
        return rows.map((row) => row.code);
    },

    /**
     * Идемпотентная запись новых unlock.
     * ON CONFLICT DO NOTHING — безопасен при гонке submit / profile catch-up.
     * Возвращает число реально вставленных строк.
     */
    async insertUnlocks(
        userId: string,
        codes: readonly AchievementCode[],
    ): Promise<number> {
        if (codes.length === 0) {
            return 0;
        }

        return withDirectPgWriteClient(async (client) => {
            let inserted = 0;

            for (const code of codes) {
                const result = await client.query(
                    `
                        INSERT INTO "UserAchievement" ("id", "userId", "code")
                        VALUES ($1, $2, $3)
                        ON CONFLICT ("userId", "code") DO NOTHING
                    `,
                    [randomUUID(), userId, code],
                );

                inserted += result.rowCount ?? 0;
            }

            return inserted;
        });
    },

    /**
     * Один Direct write-client (autocommit, без BEGIN):
     * INSERT unlocks → mark all pending outbox for user processed.
     *
     * Только result Suspense / явный award — НЕ профиль (очередь start).
     * Короткий timeout: soft-fail award важнее, чем клинить Direct queue.
     */
    async processOutboxAwardPass(
        userId: string,
        newlyEarnedCodes: readonly AchievementCode[],
    ): Promise<{ processedOutboxCount: number; insertedUnlocks: number }> {
        return withDirectPgWriteClient(
            async (client) => {
                let insertedUnlocks = 0;

                for (const code of newlyEarnedCodes) {
                    const result = await client.query(
                        `
                            INSERT INTO "UserAchievement" ("id", "userId", "code")
                            VALUES ($1, $2, $3)
                            ON CONFLICT ("userId", "code") DO NOTHING
                        `,
                        [randomUUID(), userId, code],
                    );
                    insertedUnlocks += result.rowCount ?? 0;
                }

                const marked = await client.query(
                    `
                        UPDATE "AchievementOutbox"
                        SET "processedAt" = NOW()
                        WHERE
                            "userId" = $1
                            AND "processedAt" IS NULL
                    `,
                    [userId],
                );

                return {
                    processedOutboxCount: marked.rowCount ?? 0,
                    insertedUnlocks,
                };
            },
            {
                debugLabel: 'achievement.outbox.process',
                attemptTimeoutMs: 8_000,
            },
        );
    },
};
