import type { Difficulty } from '@/types';
import { prisma, withDatabaseRetry } from '@/lib/prisma';

// тип для входных данных для создания сессии викторины
type CreateQuizSessionInput = {
    userId: string;
    difficulty: Difficulty;
    questionCount: number;
};

// репозиторий для работы с сессиями викторины
export const quizSessionRepository = {
    // создание сессии викторины
    create(input: CreateQuizSessionInput) {
        return prisma.quizSession.create({
            data: {
                userId: input.userId,
                difficulty: input.difficulty,
                questionCount: input.questionCount,
            },
        });
    },

    // поиск незавершенной сессии по ID и ID пользователя
    findInProgressByIdForUser(sessionId: string, userId: string) {
        return withDatabaseRetry(() =>
            prisma.quizSession.findFirst({
                where: {
                    id: sessionId,
                    userId,
                    status: 'IN_PROGRESS',
                },
            }),
        );
    },

    // завершение сессии викторины
    complete(sessionId: string) {
        return prisma.quizSession.update({
            where: { id: sessionId },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
            },
        });
    },
};
