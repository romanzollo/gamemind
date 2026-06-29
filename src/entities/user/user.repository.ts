// Работа с пользователями в БД
import { prisma, withDatabaseRetry } from '@/lib/prisma';
import type { Role } from '@prisma/client';

// Тип безопасного пользователя
export type SafeUser = {
    id: string;
    username: string;
    email: string;
    role: Role;
    createdAt: Date;
};

// Репозиторий для работы с пользователями
export const userRepository = {
    // Поиск пользователя по email
    findByEmail(email: string) {
        return withDatabaseRetry(() =>
            prisma.user.findUnique({ where: { email } }),
        );
    },

    // Поиск пользователя по username
    findByUsername(username: string) {
        return withDatabaseRetry(() =>
            prisma.user.findUnique({ where: { username } }),
        );
    },

    // Поиск пользователя по id
    findById(id: string) {
        return withDatabaseRetry(() =>
            prisma.user.findUnique({
                where: { id },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    role: true,
                    createdAt: true,
                },
            }),
        );
    },

    // Поиск пользователя по email для логина
    findByEmailForLogin(email: string) {
        return withDatabaseRetry(() =>
            prisma.user.findUnique({
                where: { email },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    role: true,
                    passwordHash: true, // passwordHash для логина
                },
            }),
        );
    },

    // Создание пользователя
    async create(data: {
        username: string;
        email: string;
        passwordHash: string;
    }): Promise<SafeUser> {
        return prisma.user.create({
            data: {
                username: data.username,
                email: data.email,
                passwordHash: data.passwordHash,
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });
    },
};
