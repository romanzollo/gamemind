// Работа с результатами викторин
import { prisma, withDatabaseRetry } from '@/lib/prisma';

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
        return withDatabaseRetry(() =>
            prisma.quizResult.findFirst({
                where: {
                    sessionId,
                    userId,
                },
            }),
        );
    },
};
