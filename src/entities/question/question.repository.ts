// Репозиторий для работы с вопросами в БД

import type { Difficulty } from '@/types';
import { prisma } from '@/lib/prisma';

// репозиторий для работы с вопросами
export const questionRepository = {
    // поиск активных вопросов по сложности
    findActiveByDifficulty(difficulty: Difficulty, limit: number) {
        return prisma.question.findMany({
            where: { difficulty, isActive: true },
            include: { options: { orderBy: { order: 'asc' } } },
            take: limit,
        });
    },

    // подсчет активных вопросов по сложности
    countActiveByDifficulty(difficulty: Difficulty) {
        return prisma.question.count({
            where: { difficulty, isActive: true },
        });
    },
};
