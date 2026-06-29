import { prisma } from '@/lib/prisma';

// типы для создания ответов викторины
type CreateQuizAnswerInput = {
    sessionId: string;
    questionId: string;
    selectedOptionId: string;
    isCorrect: boolean;
};

// репозиторий для работы с ответами викторины
export const quizAnswerRepository = {
    // создание множества ответов
    createMany(answers: CreateQuizAnswerInput[]) {
        return prisma.quizAnswer.createMany({
            data: answers,
        });
    },
};
