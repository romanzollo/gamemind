// Работа с результатами викторин
import { prisma, withDatabaseRetry } from '@/lib/prisma';
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
    // поиск лучших результатов викторины
    async findBestScores(limit: number) {
        const bestPerUser = await withDatabaseRetry(() =>
            prisma.quizResult.findMany({
            distinct: ['userId'],
            orderBy: [
                { userId: 'asc' },
                { score: 'desc' },
                { completedAt: 'asc' },
            ],
            include: {
                user: {
                    select: { id: true, username: true },
                },
            },
            }),
        );

        return bestPerUser
            .sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }

                return a.completedAt.getTime() - b.completedAt.getTime();
            })
            .slice(0, limit);
    },

    // создание результата викторины
    create(input: {
        sessionId: string;
        userId: string;
        score: number;
        totalQuestions: number;
        correctCount: number;
    }) {
        return prisma.quizResult.create({
            data: input,
        });
    },

    // поиск результата викторины по ID сессии и ID пользователя
    findBySessionIdForUser(sessionId: string, userId: string) {
        return loadResultBySessionIdForUser(sessionId, userId);
    },
};
