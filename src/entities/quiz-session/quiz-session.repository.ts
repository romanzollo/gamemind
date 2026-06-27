import type { Difficulty } from '@/types';
import { prisma } from '@/lib/prisma';

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
};
