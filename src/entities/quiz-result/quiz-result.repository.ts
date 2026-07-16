// Работа с результатами викторин
import { withDirectPgClient } from '@/lib/db/direct-pg';

type QuizResultRow = {
    id: string;
    session_id: string;
    user_id: string;
    score: number;
    total_questions: number;
    correct_count: number;
    completed_at: Date;
};

type LeaderboardScoreRow = {
    user_id: string;
    username: string;
    score: number;
    total_questions: number;
    correct_count: number;
    completed_at: Date;
};

type RecentResultRow = {
    session_id: string;
    score: number;
    total_questions: number;
    correct_count: number;
    completed_at: Date;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
};

async function loadResultBySessionIdForUser(sessionId: string, userId: string) {
    const result = await withDirectPgClient((client) => {
        return client.query<QuizResultRow>(
            `
                SELECT
                    "id",
                    "sessionId" AS "session_id",
                    "userId" AS "user_id",
                    "score",
                    "totalQuestions" AS "total_questions",
                    "correctCount" AS "correct_count",
                    "completedAt" AS "completed_at"
                FROM "QuizResult"
                WHERE "sessionId" = $1 AND "userId" = $2
                LIMIT 1
            `,
            [sessionId, userId],
        );
    });

    const row = result.rows[0];

    if (!row) {
        return null;
    }

    return {
        id: row.id,
        sessionId: row.session_id,
        userId: row.user_id,
        score: row.score,
        totalQuestions: row.total_questions,
        correctCount: row.correct_count,
        completedAt: row.completed_at,
    };
}

// репозиторий для работы с результатами викторины
export const quizResultRepository = {
    // лучший результат на пользователя — unpooled pg (Neon-friendly)
    async findBestScores(limit: number) {
        const result = await withDirectPgClient((client) =>
            client.query<LeaderboardScoreRow>(
                `
                    SELECT
                        best."userId" AS "user_id",
                        u."username" AS "username",
                        best."score" AS "score",
                        best."totalQuestions" AS "total_questions",
                        best."correctCount" AS "correct_count",
                        best."completedAt" AS "completed_at"
                    FROM (
                        SELECT DISTINCT ON ("userId")
                            "userId",
                            "score",
                            "totalQuestions",
                            "correctCount",
                            "completedAt"
                        FROM "QuizResult"
                        ORDER BY
                            "userId" ASC,
                            "score" DESC,
                            "completedAt" ASC
                    ) AS best
                    INNER JOIN "User" AS u ON u."id" = best."userId"
                    ORDER BY
                        best."score" DESC,
                        best."completedAt" ASC
                    LIMIT $1
                `,
                [limit],
            ),
        );

        return result.rows.map((row) => ({
            userId: row.user_id,
            score: row.score,
            totalQuestions: row.total_questions,
            correctCount: row.correct_count,
            completedAt: row.completed_at,
            user: {
                id: row.user_id,
                username: row.username,
            },
        }));
    },

    // поиск результата викторины по ID сессии и ID пользователя
    findBySessionIdForUser(sessionId: string, userId: string) {
        return loadResultBySessionIdForUser(sessionId, userId);
    },

    // последние результаты пользователя (профиль) — unpooled pg
    async findRecentByUserId(userId: string, limit: number) {
        const result = await withDirectPgClient((client) =>
            client.query<RecentResultRow>(
                `
                    SELECT
                        r."sessionId" AS "session_id",
                        r."score" AS "score",
                        r."totalQuestions" AS "total_questions",
                        r."correctCount" AS "correct_count",
                        r."completedAt" AS "completed_at",
                        s."difficulty" AS "difficulty"
                    FROM "QuizResult" AS r
                    INNER JOIN "QuizSession" AS s ON s."id" = r."sessionId"
                    WHERE r."userId" = $1
                    ORDER BY r."completedAt" DESC
                    LIMIT $2
                `,
                [userId, limit],
            ),
        );

        return result.rows.map((row) => ({
            sessionId: row.session_id,
            score: row.score,
            totalQuestions: row.total_questions,
            correctCount: row.correct_count,
            completedAt: row.completed_at,
            session: {
                difficulty: row.difficulty,
            },
        }));
    },
};
