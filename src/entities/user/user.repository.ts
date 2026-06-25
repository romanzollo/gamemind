// Работа с пользователями в БД
import { prisma } from '@/lib/prisma';
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
    findByEmail(email: string) {
        return prisma.user.findUnique({ where: { email } });
    },

    findByUsername(username: string) {
        return prisma.user.findUnique({ where: { username } });
    },

    findById(id: string) {
        return prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });
    },

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
