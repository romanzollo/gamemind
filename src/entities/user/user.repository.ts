// Работа с пользователями в БД
import type { Client } from 'pg';
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

/** Строка списка пользователей для админки (без passwordHash). */
export type AdminUserRow = {
    id: string;
    username: string;
    email: string;
    role: Role;
    isActive: boolean;
    createdAt: Date;
    quizResultCount: number;
};

export type AdminUserMutationResult =
    | 'updated'
    | 'deleted'
    | 'not_found'
    | 'unchanged'
    | 'cannot_modify_self'
    | 'cannot_delete_last_admin';

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
                    image: true, // аватар для JWT при логине
                    isActive: true, // soft-disable блокирует вход
                    passwordHash: true, // passwordHash для логина
                },
            }),
        );
    },

    /**
     * Список пользователей для админки (unpooled direct pg).
     * Без passwordHash; quizResultCount через LEFT JOIN агрегата.
     */
    async findAllForAdmin(): Promise<AdminUserRow[]> {
        const result = await withDirectPgClient((client) =>
            client.query<{
                id: string;
                username: string;
                email: string;
                role: Role;
                isActive: boolean;
                createdAt: Date;
                quizResultCount: number;
            }>(
                `
                    SELECT
                        u."id",
                        u."username",
                        u."email",
                        u."role",
                        u."isActive",
                        u."createdAt",
                        COALESCE(r."quizResultCount", 0)::int AS "quizResultCount"
                    FROM "User" u
                    LEFT JOIN (
                        SELECT "userId", COUNT(*)::int AS "quizResultCount"
                        FROM "QuizResult"
                        GROUP BY "userId"
                    ) r ON r."userId" = u."id"
                    ORDER BY u."createdAt" DESC
                `,
            ),
        );

        return result.rows.map((row) => ({
            id: row.id,
            username: row.username,
            email: row.email,
            role: row.role,
            isActive: row.isActive,
            createdAt: row.createdAt,
            quizResultCount: Number(row.quizResultCount),
        }));
    },

    /**
     * Смена роли USER ↔ ADMIN.
     * Нельзя менять себя; нельзя снять роль с последнего ADMIN.
     */
    async updateRoleForAdmin(
        targetUserId: string,
        nextRole: Role,
        actorUserId: string,
    ): Promise<AdminUserMutationResult> {
        if (targetUserId === actorUserId) {
            return 'cannot_modify_self';
        }

        return withDirectPgWriteRetry(async (client) => {
            const current = await client.query<{
                role: Role;
            }>(
                `
                    SELECT "role"
                    FROM "User"
                    WHERE "id" = $1
                    LIMIT 1
                `,
                [targetUserId],
            );

            const row = current.rows[0];

            if (!row) {
                return 'not_found';
            }

            if (row.role === nextRole) {
                return 'unchanged';
            }

            if (row.role === 'ADMIN' && nextRole === 'USER') {
                const adminCount = await countAdmins(client);

                if (adminCount <= 1) {
                    return 'cannot_delete_last_admin';
                }
            }

            await client.query(
                `
                    UPDATE "User"
                    SET "role" = $1, "updatedAt" = NOW()
                    WHERE "id" = $2
                `,
                [nextRole, targetUserId],
            );

            return 'updated';
        });
    },

    /**
     * Soft-disable / enable пользователя.
     * Нельзя менять себя; нельзя деактивировать последнего ADMIN.
     */
    async setActiveForAdmin(
        targetUserId: string,
        isActive: boolean,
        actorUserId: string,
    ): Promise<AdminUserMutationResult> {
        if (targetUserId === actorUserId) {
            return 'cannot_modify_self';
        }

        return withDirectPgWriteRetry(async (client) => {
            const current = await client.query<{
                role: Role;
                isActive: boolean;
            }>(
                `
                    SELECT "role", "isActive"
                    FROM "User"
                    WHERE "id" = $1
                    LIMIT 1
                `,
                [targetUserId],
            );

            const row = current.rows[0];

            if (!row) {
                return 'not_found';
            }

            if (row.isActive === isActive) {
                return 'unchanged';
            }

            if (!isActive && row.role === 'ADMIN') {
                const activeAdminCount = await countAdmins(client, {
                    activeOnly: true,
                });

                if (activeAdminCount <= 1) {
                    return 'cannot_delete_last_admin';
                }
            }

            await client.query(
                `
                    UPDATE "User"
                    SET "isActive" = $1, "updatedAt" = NOW()
                    WHERE "id" = $2
                `,
                [isActive, targetUserId],
            );

            return 'updated';
        });
    },

    /**
     * Hard-delete пользователя (cascade через FK).
     * Нельзя удалить себя; нельзя удалить последнего ADMIN.
     */
    async deleteByIdForAdmin(
        targetUserId: string,
        actorUserId: string,
    ): Promise<AdminUserMutationResult> {
        if (targetUserId === actorUserId) {
            return 'cannot_modify_self';
        }

        return withDirectPgWriteRetry(async (client) => {
            const current = await client.query<{
                role: Role;
            }>(
                `
                    SELECT "role"
                    FROM "User"
                    WHERE "id" = $1
                    LIMIT 1
                `,
                [targetUserId],
            );

            const row = current.rows[0];

            if (!row) {
                return 'not_found';
            }

            if (row.role === 'ADMIN') {
                const adminCount = await countAdmins(client);

                if (adminCount <= 1) {
                    return 'cannot_delete_last_admin';
                }
            }

            await client.query(
                `
                    DELETE FROM "User"
                    WHERE "id" = $1
                `,
                [targetUserId],
            );

            return 'deleted';
        });
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

    /**
     * Смена аватара (User.image) в одном unpooled connect.
     * Пустая строка imageUrl → NULL в БД (сброс).
     * То же значение, что уже в БД → 'unchanged'.
     */
    async updateImage(
        id: string,
        imageUrl: string,
    ): Promise<'updated' | 'not_found' | 'unchanged'> {
        const nextImage = imageUrl === '' ? null : imageUrl;

        // Смена аватара в одном unpooled connect
        return withDirectPgWriteRetry(async (client) => {
            const current = await client.query<{ image: string | null }>(
                `
                SELECT "image"
                FROM "User"
                WHERE "id" = $1
                LIMIT 1
            `,
                [id],
            );

            // Получение текущего аватара
            const row = current.rows[0];

            if (!row) {
                return 'not_found';
            }

            // Проверка на то, что аватар не изменился
            if (row.image === nextImage) {
                return 'unchanged';
            }

            // Смена аватара в БД
            await client.query(
                `
                UPDATE "User"
                SET "image" = $1, "updatedAt" = NOW()
                WHERE "id" = $2
            `,
                [nextImage, id],
            );

            return 'updated';
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

async function countAdmins(
    client: Client,
    options?: { activeOnly?: boolean },
): Promise<number> {
    const activeOnly = options?.activeOnly === true;
    const result = await client.query<{ count: number }>(
        activeOnly
            ? `
                SELECT COUNT(*)::int AS "count"
                FROM "User"
                WHERE "role" = 'ADMIN' AND "isActive" = true
              `
            : `
                SELECT COUNT(*)::int AS "count"
                FROM "User"
                WHERE "role" = 'ADMIN'
              `,
    );

    return Number(result.rows[0]?.count ?? 0);
}
