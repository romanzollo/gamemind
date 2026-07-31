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
    has_medium: boolean | null;
    has_hard: boolean | null;
};

type UnlockRow = {
    code: string;
    unlocked_at: Date;
};

function mapEvalFactsRow(row: EvalFactsRow | undefined): AchievementEvalFacts {
    return {
        quizzesCompleted: Number(row?.quizzes_completed ?? 0),
        hasPerfectQuiz: Boolean(row?.has_perfect),
        hasDailyCompleted: Boolean(row?.has_daily),
        hasMediumCompleted: Boolean(row?.has_medium),
        hasHardCompleted: Boolean(row?.has_hard),
    };
}

const EVAL_FACTS_SQL = `
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
            BOOL_OR(s.difficulty = 'MEDIUM'),
            false
        ) AS has_medium,
        COALESCE(
            BOOL_OR(s.difficulty = 'HARD'),
            false
        ) AS has_hard
    FROM "QuizResult" AS r
    INNER JOIN "QuizSession" AS s ON s.id = r."sessionId"
    WHERE r."userId" = $1
`;

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
};
