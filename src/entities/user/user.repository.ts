// Работа с пользователями в БД
import type { Client } from 'pg';
import { withDirectPgClient, withDirectPgWriteRetry } from '@/lib/db/direct-pg';
import { prisma, withDatabaseRetry } from '@/lib/prisma';
import { Prisma, type Role } from '@prisma/client';

// Тип безопасного пользователя
export type SafeUser = {
    id: string;
    username: string;
    email: string | null;
    role: Role;
    createdAt: Date;
};

/** Строка списка пользователей для админки (без passwordHash). */
export type AdminUserRow = {
    id: string;
    username: string;
    email: string | null;
    role: Role;
    isActive: boolean;
    /** Гость без регистрации: роль ему не выдаём (см. updateRoleForAdmin). */
    isGuest: boolean;
    /** Служебный smoke-аккаунт (mark-test-account.cjs). */
    isTestAccount: boolean;
    createdAt: Date;
    quizResultCount: number;
};

/** Минимальный авторитетный профиль для server-side guards. */
export type SessionUserRow = {
    id: string;
    username: string;
    email: string | null;
    role: Role;
    image: string | null;
    isActive: boolean;
    /** Гость (3.4): Классика и Челлендж, без рейтингов. */
    isGuest: boolean;
};

/** Способы входа игрока — для блока в профиле. */
export type SignInMethods = {
    email: string | null;
    hasPassword: boolean;
    /** id провайдеров Auth.js из `Account`: 'yandex', 'vk'. */
    providers: string[];
};

/** Пользователь для адаптера Auth.js (внешний вход). Без passwordHash. */
export type AuthUserRow = {
    id: string;
    username: string;
    email: string | null;
    emailVerified: Date | null;
    image: string | null;
    role: Role;
    isActive: boolean;
    isGuest: boolean;
};

const AUTH_USER_SELECT = {
    id: true,
    username: true,
    email: true,
    emailVerified: true,
    image: true,
    role: true,
    isActive: true,
    isGuest: true,
} as const;

export type AdminUserMutationResult =
    | 'updated'
    | 'deleted'
    | 'not_found'
    | 'unchanged'
    | 'cannot_modify_self'
    | 'cannot_delete_last_admin'
    /** Гостю ADMIN не выдаём: у него нет ни пароля, ни входа — только кука. */
    | 'cannot_promote_guest';

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
     * Актуальное состояние пользователя для protected/admin guards.
     * JWT хранит role/isActive косвенно и может устареть после действий админа.
     */
    async findSessionUserById(id: string): Promise<SessionUserRow | null> {
        const result = await withDirectPgClient((client) =>
            client.query<SessionUserRow>(
                `
                    SELECT
                        "id",
                        "username",
                        "email",
                        "role"::text AS "role",
                        "image",
                        "isActive",
                        "isGuest"
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
            username: row.username,
            email: row.email,
            role: row.role,
            image: row.image,
            isActive: row.isActive === true,
            isGuest: row.isGuest === true,
        };
    },

    /**
     * Страница списка пользователей для админки (unpooled direct pg).
     *
     * Одним запросом за одно соединение: страница + общее число
     * (`COUNT(*) OVER ()` до LIMIT). Число результатов — подзапросом только
     * для строк страницы (индекс QuizResult.userId), а не агрегатом по всей
     * таблице результатов, которая растёт с каждой игрой.
     * Поиск — параметром `$1` (подстрока имени или почты без учёта регистра);
     * гости по умолчанию не попадают в выборку.
     * Без passwordHash. Индекса под `ORDER BY createdAt` нет сознательно:
     * при тысячах строк сортировка в памяти дешевле лишнего индекса на запись
     * (ADR «Admin users list: pages, search, guests hidden»).
     */
    async findPageForAdmin(options: {
        q: string;
        includeGuests: boolean;
        page: number;
        pageSize: number;
    }): Promise<{ rows: AdminUserRow[]; totalCount: number }> {
        const offset = (Math.max(1, options.page) - 1) * options.pageSize;
        const search = options.q.trim().toLowerCase();

        // $1 — строка поиска ('' = без поиска), $2 — гости, $3/$4 — LIMIT/OFFSET.
        const whereSql = `
            WHERE ($2::boolean OR u."isGuest" = false)
              AND (
                $1::text = ''
                OR position($1::text in lower(u."username")) > 0
                OR position($1::text in lower(COALESCE(u."email", ''))) > 0
              )
        `;

        return withDirectPgClient(async (client) => {
            const result = await client.query<{
                id: string;
                username: string;
                email: string | null;
                role: Role;
                isActive: boolean;
                isGuest: boolean;
                isTestAccount: boolean;
                createdAt: Date;
                quizResultCount: number;
                totalCount: number;
            }>(
                `
                    WITH page AS (
                        SELECT
                            u."id",
                            u."username",
                            u."email",
                            u."role",
                            u."isActive",
                            u."isGuest",
                            u."isTestAccount",
                            u."createdAt",
                            COUNT(*) OVER () AS "totalCount"
                        FROM "User" u
                        ${whereSql}
                        ORDER BY u."createdAt" DESC, u."id" DESC
                        LIMIT $3 OFFSET $4
                    )
                    SELECT
                        page."id",
                        page."username",
                        page."email",
                        page."role",
                        page."isActive",
                        page."isGuest",
                        page."isTestAccount",
                        page."createdAt",
                        page."totalCount"::int AS "totalCount",
                        (
                            SELECT COUNT(*)::int
                            FROM "QuizResult" r
                            WHERE r."userId" = page."id"
                        ) AS "quizResultCount"
                    FROM page
                    ORDER BY page."createdAt" DESC, page."id" DESC
                `,
                [search, options.includeGuests, options.pageSize, offset],
            );

            let totalCount = Number(result.rows[0]?.totalCount ?? 0);

            // Пустая страница при page > 1 (ссылка устарела): OVER() без строк
            // не знает общего числа — отдельный COUNT на том же соединении,
            // страница уведёт на последнюю существующую.
            if (result.rows.length === 0 && options.page > 1) {
                const countResult = await client.query<{ c: number }>(
                    `SELECT COUNT(*)::int AS c FROM "User" u ${whereSql}`,
                    [search, options.includeGuests],
                );
                totalCount = Number(countResult.rows[0]?.c ?? 0);
            }

            return {
                rows: result.rows.map((row) => ({
                    id: row.id,
                    username: row.username,
                    email: row.email,
                    role: row.role,
                    isActive: row.isActive === true,
                    isGuest: row.isGuest === true,
                    isTestAccount: row.isTestAccount === true,
                    createdAt: row.createdAt,
                    quizResultCount: Number(row.quizResultCount),
                })),
                totalCount,
            };
        });
    },

    /**
     * Карточка одного пользователя для админ-support (read-only detail).
     * Тот же безопасный набор полей, что и в списке — без passwordHash.
     * Unpooled direct pg: тот же Neon-friendly путь, что findPageForAdmin.
     */
    async findByIdForAdmin(userId: string): Promise<AdminUserRow | null> {
        const result = await withDirectPgClient((client) =>
            client.query<{
                id: string;
                username: string;
                email: string | null;
                role: Role;
                isActive: boolean;
                isGuest: boolean;
                isTestAccount: boolean;
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
                        u."isGuest",
                        u."isTestAccount",
                        u."createdAt",
                        COALESCE(r."quizResultCount", 0)::int AS "quizResultCount"
                    FROM "User" u
                    LEFT JOIN (
                        SELECT "userId", COUNT(*)::int AS "quizResultCount"
                        FROM "QuizResult"
                        WHERE "userId" = $1
                        GROUP BY "userId"
                    ) r ON r."userId" = u."id"
                    WHERE u."id" = $1
                    LIMIT 1
                `,
                [userId],
            ),
        );

        const row = result.rows[0];

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            username: row.username,
            email: row.email,
            role: row.role,
            isActive: row.isActive === true,
            isGuest: row.isGuest === true,
            isTestAccount: row.isTestAccount === true,
            createdAt: row.createdAt,
            quizResultCount: Number(row.quizResultCount),
        };
    },

    /**
     * Смена роли USER ↔ ADMIN.
     * Нельзя менять себя; нельзя снять роль с последнего ADMIN;
     * гостя нельзя сделать ADMIN (проверка здесь, а не только в UI —
     * форму можно отправить и в обход кнопки).
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
                isGuest: boolean;
            }>(
                `
                    SELECT "role", "isGuest"
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

            if (nextRole === 'ADMIN' && row.isGuest === true) {
                return 'cannot_promote_guest';
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

            const currentlyActive = row.isActive === true;

            if (currentlyActive === isActive) {
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

    /*
     * Внешний вход (Яндекс ID, VK ID) — методы для адаптера Auth.js
     * (src/lib/auth/adapter.ts). Только на входе, не на горячем пути квиза.
     * Canon: DECISIONS → Accounts without a password.
     */

    findAuthUserById(id: string): Promise<AuthUserRow | null> {
        return withDatabaseRetry(() =>
            prisma.user.findUnique({ where: { id }, select: AUTH_USER_SELECT }),
        );
    },

    findAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
        return withDatabaseRetry(() =>
            prisma.user.findUnique({
                where: { email },
                select: AUTH_USER_SELECT,
            }),
        );
    },

    async findAuthUserByAccount(
        provider: string,
        providerAccountId: string,
    ): Promise<AuthUserRow | null> {
        const account = await withDatabaseRetry(() =>
            prisma.account.findUnique({
                where: {
                    provider_providerAccountId: { provider, providerAccountId },
                },
                select: { user: { select: AUTH_USER_SELECT } },
            }),
        );

        return account?.user ?? null;
    },

    /** Какие из ников-кандидатов уже заняты — одним запросом. */
    async findTakenUsernames(candidates: string[]): Promise<Set<string>> {
        const rows = await withDatabaseRetry(() =>
            prisma.user.findMany({
                where: { username: { in: candidates } },
                select: { username: true },
            }),
        );

        return new Set(rows.map((row) => row.username));
    },

    createOAuthUser(data: {
        username: string;
        email: string | null;
        emailVerified: Date | null;
        image: string | null;
    }): Promise<AuthUserRow> {
        return prisma.user.create({ data, select: AUTH_USER_SELECT });
    },

    /**
     * Гость (3.4): строка без почты и пароля, `isGuest = true`. Ник
     * занят → 'taken' (вызывающий пробует другой). Canon: DECISIONS →
     * Accounts without a password.
     */
    async createGuestUser(
        username: string,
    ): Promise<AuthUserRow | 'taken'> {
        try {
            return await prisma.user.create({
                data: { username, isGuest: true },
                select: AUTH_USER_SELECT,
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                return 'taken';
            }
            throw error;
        }
    },

    /**
     * Регистрация гостя (3.4): та же строка получает ник, почту и пароль
     * и перестаёт быть гостем — игры никуда не переезжают. Условие
     * `isGuest = true` не даст переписать обычный аккаунт. Занятые почта
     * или ник (23505) → свой код, как в обычной регистрации.
     */
    async claimGuestWithPassword(
        id: string,
        data: { username: string; email: string; passwordHash: string },
    ): Promise<'claimed' | 'not_guest' | 'email_taken' | 'username_taken'> {
        return withDirectPgWriteRetry(async (client) => {
            try {
                const result = await client.query(
                    `
                        UPDATE "User"
                        SET "username" = $1,
                            "email" = $2,
                            "passwordHash" = $3,
                            "isGuest" = false,
                            "updatedAt" = NOW()
                        WHERE "id" = $4
                          AND "isGuest" = true
                    `,
                    [data.username, data.email, data.passwordHash, id],
                );

                return result.rowCount ? 'claimed' : 'not_guest';
            } catch (error) {
                if (isPgUniqueViolation(error)) {
                    return readPgConstraint(error) === 'User_email_key'
                        ? 'email_taken'
                        : 'username_taken';
                }
                throw error;
            }
        });
    },

    /**
     * Перенос игр гостя в аккаунт, в который он вошёл (Яндекс, VK или
     * пароль), и удаление гостя. Canon: DECISIONS → Accounts without a
     * password → Claim by sign-in.
     *
     * Без BEGIN/COMMIT (Neon write path в DECISIONS): шаги идут по
     * порядку, каждый идемпотентен, а гость удаляется последним. Упали
     * посередине — часть игр уже у аккаунта, часть ещё у гостя, и
     * повторный вход доносит остальное.
     *
     * - Челлендж дня, сыгранный обоими, остаётся за аккаунтом (UNIQUE
     *   userId + dailyChallengeId), попытка гостя удаляется.
     * - Достижения гостя переезжают, если у аккаунта таких нет; общий
     *   пересчёт — на вызывающем (awardAchievementsForUser).
     * - Мешок анти-повтора гостя уходит каскадом вместе со строкой.
     *
     * 'skipped' — переносить нечего: гостя уже нет, это не гость или
     * цель сама гость.
     */
    async mergeGuestInto(
        guestId: string,
        targetId: string,
    ): Promise<'merged' | 'skipped'> {
        if (guestId === targetId) return 'skipped';

        return withDirectPgWriteRetry(async (client) => {
            const guard = await client.query(
                `
                    SELECT 1
                    FROM "User" g, "User" t
                    WHERE g."id" = $1 AND g."isGuest" = true
                      AND t."id" = $2 AND t."isGuest" = false
                `,
                [guestId, targetId],
            );

            if (!guard.rowCount) return 'skipped';

            const params = [guestId, targetId];

            await client.query(
                `
                    DELETE FROM "QuizSession" g
                    WHERE g."userId" = $1
                      AND g."dailyChallengeId" IS NOT NULL
                      AND EXISTS (
                          SELECT 1 FROM "QuizSession" t
                          WHERE t."userId" = $2
                            AND t."dailyChallengeId" = g."dailyChallengeId"
                      )
                `,
                params,
            );

            for (const table of [
                'SurvivalRun',
                'QuizSession',
                'QuizResult',
                'AchievementOutbox',
            ]) {
                await client.query(
                    `UPDATE "${table}" SET "userId" = $2 WHERE "userId" = $1`,
                    params,
                );
            }

            await client.query(
                `
                    UPDATE "UserAchievement" g
                    SET "userId" = $2
                    WHERE g."userId" = $1
                      AND NOT EXISTS (
                          SELECT 1 FROM "UserAchievement" t
                          WHERE t."userId" = $2 AND t."code" = g."code"
                      )
                `,
                params,
            );

            await client.query(
                `DELETE FROM "User" WHERE "id" = $1 AND "isGuest" = true`,
                [guestId],
            );

            return 'merged';
        });
    },

    /**
     * Привязка внешнего аккаунта. Токены провайдера не храним: нам нужен
     * только факт «этот Яндекс-аккаунт = этот игрок», а лишний токен в БД —
     * лишний риск при утечке.
     */
    async linkOAuthAccount(data: {
        userId: string;
        type: string;
        provider: string;
        providerAccountId: string;
    }): Promise<void> {
        await prisma.account.create({ data });
    },

    /**
     * Способы входа для профиля: есть ли пароль и какие внешние входы
     * привязаны. Наружу — только флаг, сам хэш из репозитория не уходит.
     */
    async findSignInMethods(id: string): Promise<SignInMethods | null> {
        const row = await withDatabaseRetry(() =>
            prisma.user.findUnique({
                where: { id },
                select: {
                    email: true,
                    passwordHash: true,
                    accounts: { select: { provider: true } },
                },
            }),
        );

        if (!row) return null;

        return {
            email: row.email,
            hasPassword: row.passwordHash !== null,
            providers: row.accounts.map((account) => account.provider),
        };
    },

    /**
     * Первый пароль для аккаунта без пароля (вход через Яндекс / VK ID).
     * Почту пишем, только если её ещё нет; UPDATE идёт с условием
     * `passwordHash IS NULL`, так что существующий пароль не перезаписать
     * даже двумя запросами подряд. Занятая почта (23505) → 'email_taken'.
     */
    async setInitialPassword(
        id: string,
        data: { email: string | null; passwordHash: string },
    ): Promise<'updated' | 'already_set' | 'email_taken' | 'email_required'> {
        return withDirectPgWriteRetry(async (client) => {
            try {
                const result = await client.query<{ email: string | null }>(
                    `
                        UPDATE "User"
                        SET "passwordHash" = $1,
                            "email" = COALESCE("email", $2),
                            "updatedAt" = NOW()
                        WHERE "id" = $3
                          AND "passwordHash" IS NULL
                          AND COALESCE("email", $2) IS NOT NULL
                        RETURNING "email"
                    `,
                    [data.passwordHash, data.email, id],
                );

                if (result.rows[0]) return 'updated';
            } catch (error) {
                if (isPgUniqueViolation(error)) return 'email_taken';
                throw error;
            }

            // Ничего не обновили: пароль уже есть или почты нет нигде.
            const current = await client.query<{ hasPassword: boolean }>(
                `
                    SELECT "passwordHash" IS NOT NULL AS "hasPassword"
                    FROM "User"
                    WHERE "id" = $1
                    LIMIT 1
                `,
                [id],
            );

            return current.rows[0]?.hasPassword
                ? 'already_set'
                : 'email_required';
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
/** Имя нарушенного ограничения из ошибки pg (например 'User_email_key'). */
function readPgConstraint(error: unknown): string | null {
    return typeof error === 'object' &&
        error !== null &&
        'constraint' in error &&
        typeof (error as { constraint: unknown }).constraint === 'string'
        ? (error as { constraint: string }).constraint
        : null;
}

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
