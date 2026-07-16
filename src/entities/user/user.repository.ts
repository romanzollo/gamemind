// Работа с пользователями в БД
import { withDirectPgClient, withDirectPgWriteRetry } from '@/lib/db/direct-pg';
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

    // Поиск по id с passwordHash (только для серверной проверки пароля)
    async findByIdForAuth(id: string) {
        const result = await withDirectPgClient((client) =>
            client.query<{ id: string; passwordHash: string | null }>(
                `
                    SELECT "id", "passwordHash"
                    FROM "User"
                    WHERE "id" = $1
                    LIMIT 1
                `,
                [id],
            ),
        );

        const row = result.rows[0];

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            passwordHash: row.passwordHash,
        };
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

    /**
     * Смена пароля в одном unpooled connect:
     * SELECT hash → verify/hash в JS → UPDATE.
     * bcrypt остаётся снаружи SQL.
     */
    async changePasswordHash(
        id: string,
        options: {
            isCurrentPasswordValid: (passwordHash: string) => Promise<boolean>;
            hashNewPassword: () => Promise<string>;
        },
    ): Promise<'updated' | 'not_found' | 'wrong_password' | 'missing_hash'> {
        return withDirectPgWriteRetry(async (client) => {
            const current = await client.query<{
                passwordHash: string | null;
            }>(
                `
                    SELECT "passwordHash"
                    FROM "User"
                    WHERE "id" = $1
                    LIMIT 1
                `,
                [id],
            );

            const row = current.rows[0];

            if (!row) {
                return 'not_found';
            }

            if (!row.passwordHash) {
                return 'missing_hash';
            }

            const isValid = await options.isCurrentPasswordValid(
                row.passwordHash,
            );

            if (!isValid) {
                return 'wrong_password';
            }

            const passwordHash = await options.hashNewPassword();

            await client.query(
                `
                    UPDATE "User"
                    SET "passwordHash" = $1, "updatedAt" = NOW()
                    WHERE "id" = $2
                `,
                [passwordHash, id],
            );

            return 'updated';
        });
    },

    /**
     * Смена username в одном unpooled connect.
     * Unique violation (23505) → 'taken'; same value → 'unchanged'.
     */
    async updateUsername(
        id: string,
        username: string,
    ): Promise<'updated' | 'not_found' | 'taken' | 'unchanged'> {
        return withDirectPgWriteRetry(async (client) => {
            const current = await client.query<{ username: string }>(
                `
                    SELECT "username"
                    FROM "User"
                    WHERE "id" = $1
                    LIMIT 1
                `,
                [id],
            );

            const row = current.rows[0];

            if (!row) {
                return 'not_found';
            }

            if (row.username === username) {
                return 'unchanged';
            }

            try {
                await client.query(
                    `
                        UPDATE "User"
                        SET "username" = $1, "updatedAt" = NOW()
                        WHERE "id" = $2
                    `,
                    [username, id],
                );

                return 'updated';
            } catch (error) {
                if (isPgUniqueViolation(error)) {
                    return 'taken';
                }

                throw error;
            }
        });
    },
};

// Проверка на уникальность username
function isPgUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: unknown }).code === '23505'
    );
}
