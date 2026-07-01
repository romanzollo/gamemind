// Репозиторий для работы с вопросами в БД

import type { Difficulty } from '@/types';
import { prisma, withDatabaseRetry } from '@/lib/prisma';

// репозиторий для работы с вопросами
export const questionRepository = {
    // поиск активных вопросов по сложности
    findActiveByDifficulty(difficulty: Difficulty, limit: number) {
        return withDatabaseRetry(() =>
            prisma.question.findMany({
                where: { difficulty, isActive: true },
                include: { options: { orderBy: { order: 'asc' } } },
                take: limit,
            }),
        );
    },

    // подсчет активных вопросов по сложности
    countActiveByDifficulty(difficulty: Difficulty) {
        return withDatabaseRetry(() =>
            prisma.question.count({
                where: { difficulty, isActive: true },
            }),
        );
    },

    // поиск активных публичных вопросов по сложности
    findActivePublicByDifficulty(difficulty: Difficulty, limit: number) {
        return withDatabaseRetry(() =>
            prisma.question.findMany({
                where: { difficulty, isActive: true },
                orderBy: { createdAt: 'asc' },
                take: limit,
                select: {
                    id: true,
                    text: true,
                    difficulty: true,
                    options: {
                        orderBy: { order: 'asc' },
                        select: {
                            id: true,
                            text: true,
                            order: true,
                        },
                    },
                },
            }),
        );
    },

    // поиск активных вопросов для scoring
    findActiveForScoring(difficulty: Difficulty, limit: number) {
        return withDatabaseRetry(() =>
            prisma.question.findMany({
                where: { difficulty, isActive: true },
                orderBy: { createdAt: 'asc' },
                take: limit,
                include: {
                    options: {
                        orderBy: { order: 'asc' }, // страница квиза уже использует такой же порядок в findActivePublicByDifficulty
                    },
                },
            }),
        );
    },

    // список вопросов для админ-панели
    findAllForAdmin() {
        return withDatabaseRetry(() =>
            prisma.question.findMany({
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    text: true,
                    difficulty: true,
                    category: true,
                    isActive: true,
                    createdAt: true,
                    _count: {
                        select: {
                            options: true,
                        },
                    },
                },
            }),
        );
    },
};
