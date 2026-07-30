/**
 * Persist / read UserAchievement unlock rows (Achievements MVP, variant A).
 *
 * Зачем entity-слой:
 * - SQL отдельно от evaluate (чистые правила) и от UI;
 * - не смешивать с quiz snapshot/submit write path — award вызывается после complete;
 * - каталога в БД нет: `code` = slug из ACHIEVEMENT_CATALOG.
 *
 * Canon: docs/DECISIONS.md → Achievements MVP.
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
    has_perfect: boolean | null;
    has_daily: boolean | null;
    has_hard: boolean | null;
};

type UnlockedCodeRow = {
    code: string;
};

export const userAchievementRepository = {
    /**
     * Агрегаты для evaluateAchievements: один SELECT + JOIN Session.
     * Без GROUP BY aggregate всегда даёт 1 строку (COUNT=0, если результатов нет).
     */
    async findEvalFactsByUserId(userId: string): Promise<AchievementEvalFacts> {
        const result = await withDirectPgClient((client) =>
            client.query<EvalFactsRow>(
                `
                    SELECT
                        COUNT(r.id)::int AS quizzes_completed,
                        COALESCE(
                            BOOL_OR(
                                r."correctCount" = r."totalQuestions"
                                AND r."totalQuestions" > 0
                            ),
                            false
                        ) AS has_perfect,
                        COALESCE(
                            BOOL_OR(s."dailyChallengeId" IS NOT NULL),
                            false
                        ) AS has_daily,
                        COALESCE(
                            BOOL_OR(s.difficulty = 'HARD'),
                            false
                        ) AS has_hard
                    FROM "QuizResult" AS r
                    INNER JOIN "QuizSession" AS s ON s.id = r."sessionId"
                    WHERE r."userId" = $1
                `,
                [userId],
            ),
        );

        const row = result.rows[0];

        return {
            quizzesCompleted: Number(row?.quizzes_completed ?? 0),
            hasPerfectQuiz: Boolean(row?.has_perfect),
            hasDailyCompleted: Boolean(row?.has_daily),
            hasHardCompleted: Boolean(row?.has_hard),
        };
    },

    /** Уже сохранённые коды unlock (для diff с evaluate). */
    async findUnlockedCodesByUserId(userId: string): Promise<string[]> {
        const result = await withDirectPgClient((client) =>
            client.query<UnlockedCodeRow>(
                `
                    SELECT code
                    FROM "UserAchievement"
                    WHERE "userId" = $1
                `,
                [userId],
            ),
        );

        return result.rows.map((row) => row.code);
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
};
