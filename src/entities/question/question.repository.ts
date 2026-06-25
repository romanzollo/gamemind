// Работа с вопросами в БД

import type { Difficulty } from '@/types';
import { prisma } from '@/lib/prisma';

export const questionRepository = {
    findActiveByDifficulty(difficulty: Difficulty, limit: number) {
        return prisma.question.findMany({
            where: { difficulty, isActive: true },
            include: { options: { orderBy: { order: 'asc' } } },
            take: limit,
        });
    },
};
