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

    // один вопрос для страницы редактирования (admin edit flow)
    findByIdForAdmin(id: string) {
        return withDatabaseRetry(() =>
            prisma.question.findUnique({
                where: { id },
                select: {
                    id: true,
                    text: true,
                    difficulty: true,
                    category: true,
                    isActive: true,
                    options: {
                        orderBy: { order: 'asc' },
                        select: {
                            id: true,
                            text: true,
                            isCorrect: true,
                            order: true,
                        },
                    },
                },
            }),
        );
    },

    // создание вопроса с вариантами ответа (admin create flow)
    createWithOptions(input: {
        text: string;
        difficulty: Difficulty;
        category: string;
        options: Array<{
            text: string;
            isCorrect: boolean;
            order: number;
        }>;
    }) {
        return withDatabaseRetry(() =>
            prisma.question.create({
                data: {
                    text: input.text,
                    difficulty: input.difficulty,
                    category: input.category,
                    isActive: true,
                    options: {
                        create: input.options.map((option) => ({
                            text: option.text,
                            isCorrect: option.isCorrect,
                            order: option.order,
                        })),
                    },
                },
                select: { id: true },
            }),
        );
    },

    // обновление вопроса и вариантов по id (admin edit flow)
    updateWithOptions(input: {
        questionId: string;
        text: string;
        difficulty: Difficulty;
        category: string;
        options: Array<{
            id: string;
            text: string;
            isCorrect: boolean;
            order: number;
        }>;
    }) {
        return withDatabaseRetry(() =>
            prisma.$transaction(async (tx) => {
                const existing = await tx.question.findUnique({
                    where: { id: input.questionId },
                    select: { id: true },
                });

                if (!existing) {
                    return null;
                }

                await tx.question.update({
                    where: { id: input.questionId },
                    data: {
                        text: input.text,
                        difficulty: input.difficulty,
                        category: input.category,
                    },
                });

                for (const option of input.options) {
                    const result = await tx.answerOption.updateMany({
                        where: {
                            id: option.id,
                            questionId: input.questionId,
                        },
                        data: {
                            text: option.text,
                            isCorrect: option.isCorrect,
                            order: option.order,
                        },
                    });

                    if (result.count === 0) {
                        throw new Error(
                            `Option ${option.id} not found for question ${input.questionId}`,
                        );
                    }
                }

                return { id: input.questionId };
            }),
        );
    },

    // деактивация вопроса по id (admin deactivate flow)
    deactivateById(id: string) {
        return withDatabaseRetry(() =>
            prisma.$transaction(async (tx) => {
                const question = await tx.question.findUnique({
                    where: { id },
                    select: { id: true, isActive: true },
                });

                if (!question) {
                    return { status: 'not_found' } as const;
                }

                if (!question.isActive) {
                    return { status: 'already_in_target_state' } as const;
                }

                await tx.question.update({
                    where: { id },
                    data: { isActive: false },
                    select: { id: true },
                });

                return { status: 'updated' } as const;
            }),
        );
    },

    // активация вопроса по id (admin activate flow)
    activateById(id: string) {
        return withDatabaseRetry(() =>
            prisma.$transaction(async (tx) => {
                const question = await tx.question.findUnique({
                    where: { id },
                    select: { id: true, isActive: true },
                });

                if (!question) {
                    return { status: 'not_found' } as const;
                }

                if (question.isActive) {
                    return { status: 'already_in_target_state' } as const;
                }

                await tx.question.update({
                    where: { id },
                    data: { isActive: true },
                    select: { id: true },
                });

                return { status: 'updated' } as const;
            }),
        );
    },

    // удаление вопроса по id (admin delete flow)
    deleteById(id: string) {
        return withDatabaseRetry(() =>
            prisma.question.delete({
                where: { id },
                select: { id: true },
            }),
        );
    },
};
