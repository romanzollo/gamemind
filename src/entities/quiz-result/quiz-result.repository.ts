// Работа с результатами викторин
import { prisma } from '@/lib/prisma';

// репозиторий для работы с результатами викторины
export const quizResultRepository = {
    // поиск лучших результатов викторины
    findBestScores(limit: number) {
        return prisma.quizResult.findMany({
            distinct: ['userId'],
            orderBy: [
                { userId: 'asc' },
                { score: 'desc' },
                { completedAt: 'asc' },
            ],
            take: limit,
            include: {
                user: {
                    select: { id: true, username: true },
                },
            },
        });
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
        return prisma.quizResult.findFirst({
            where: {
                sessionId,
                userId,
            },
        });
    },
};
