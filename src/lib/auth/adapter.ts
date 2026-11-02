/**
 * Адаптер Auth.js для внешнего входа (Яндекс ID, VK ID) поверх нашей модели.
 *
 * Сессии остаются JWT — адаптер нужен только чтобы найти / создать игрока
 * и привязать к нему внешний аккаунт (`Account`). Стоковый
 * `@auth/prisma-adapter` не подходит: он пишет `name`, а у нас обязательный
 * `username` по своим правилам и необязательный email.
 *
 * Только сервер (Prisma). Не импортировать в proxy / auth.config (edge).
 * Canon: docs/DECISIONS.md → Accounts without a password.
 */

import { randomInt } from 'node:crypto';
import type { Account } from 'next-auth';
import type { Adapter, AdapterUser } from 'next-auth/adapters';

import {
    userRepository,
    type AuthUserRow,
} from '@/entities/user/user.repository';
import { importOAuthAvatar, isImportedAvatarUrl } from './oauth-avatar';
import { toUsernameBase, withUsernameSuffix } from './oauth-username';

/** Сколько случайных суффиксов пробуем, если основа ника занята. */
const USERNAME_SUFFIX_ATTEMPTS = 5;

function normalizeEmail(email: string | null | undefined): string | null {
    const trimmed = email?.trim().toLowerCase();
    return trimmed ? trimmed : null;
}

function toAdapterUser(row: AuthUserRow): AdapterUser {
    return {
        id: row.id,
        name: row.username,
        // Тип Auth.js требует строку; почты может не быть (VK ID, гость).
        // Пустая строка дальше нигде не используется как адрес: guards
        // берут email из БД (`findSessionUserById`).
        email: row.email ?? '',
        emailVerified: row.emailVerified,
        image: row.image,
        role: row.role,
        isGuest: row.isGuest,
    };
}

/** Основа ника, а если занята — основа с 4 случайными цифрами. Один запрос. */
async function pickFreeUsername(raw: string | null | undefined) {
    const base = toUsernameBase(raw);
    const candidates = [base];

    for (let i = 0; i < USERNAME_SUFFIX_ATTEMPTS; i += 1) {
        candidates.push(
            withUsernameSuffix(base, String(randomInt(1000, 10000))),
        );
    }

    const taken = await userRepository.findTakenUsernames(candidates);
    const free = candidates.find((candidate) => !taken.has(candidate));

    if (!free) {
        throw new Error('OAUTH_USERNAME_EXHAUSTED');
    }

    return free;
}

export function createGameMindAdapter(): Adapter {
    return {
        async createUser(user) {
            // user.id здесь — id у провайдера, а не наш: не используем.
            // Провайдер может не дать почту, хотя тип говорит string.
            // Протухающую ссылку на фото (VK ID) в БД не пишем: сначала
            // строка, потом копия фото под наш id (oauth-avatar.ts).
            const avatarToImport = isImportedAvatarUrl(user.image)
                ? user.image
                : null;
            const row = await userRepository.createOAuthUser({
                username: await pickFreeUsername(user.name ?? user.email),
                email: normalizeEmail(user.email),
                emailVerified: user.emailVerified ?? null,
                image: avatarToImport ? null : (user.image ?? null),
            });

            if (avatarToImport) {
                const image = await importOAuthAvatar(row.id, avatarToImport);
                const status = image
                    ? await userRepository.updateImage(row.id, image)
                    : null;

                if (image && status === 'updated') {
                    return toAdapterUser({ ...row, image });
                }
            }

            return toAdapterUser(row);
        },

        // Auth.js зовёт getUser только чтобы привязать внешний аккаунт к
        // тому, кто уже вошёл (session.sub). Гостя «вошедшим» не считаем:
        // тогда Яндекс / VK ведут обычный вход в свой аккаунт, а игры гостя
        // переносит колбэк jwt (lib/auth/index.ts). Проверено
        // vk-id.flow.test.ts на настоящем Auth.js.
        async getUser(id) {
            const row = await userRepository.findAuthUserById(id);
            return row && !row.isGuest ? toAdapterUser(row) : null;
        },

        async getUserByEmail(email) {
            const normalized = normalizeEmail(email);
            if (!normalized) return null;

            const row = await userRepository.findAuthUserByEmail(normalized);
            return row ? toAdapterUser(row) : null;
        },

        async getUserByAccount({ provider, providerAccountId }) {
            const row = await userRepository.findAuthUserByAccount(
                provider,
                providerAccountId,
            );
            return row ? toAdapterUser(row) : null;
        },

        // Вызывается только во входе по ссылке на почту, которого у нас нет.
        // Профиль меняют свои actions (ник, аватар), не Auth.js.
        async updateUser(user) {
            const row = await userRepository.findAuthUserById(user.id);
            if (!row) throw new Error('OAUTH_USER_NOT_FOUND');
            return toAdapterUser(row);
        },

        async linkAccount(account) {
            await userRepository.linkOAuthAccount({
                userId: account.userId,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
            });
        },
    };
}

/**
 * Отключённый админом игрок не входит и через внешний аккаунт — так же,
 * как по паролю (`credentialsProvider`). Ищем того, к кому вход приведёт:
 * по привязанному аккаунту, иначе по почте (автопривязка Яндекса).
 */
export async function isOAuthSignInAllowed(
    account: Pick<Account, 'provider' | 'providerAccountId'>,
    email: string | null | undefined,
): Promise<boolean> {
    const byAccount = await userRepository.findAuthUserByAccount(
        account.provider,
        account.providerAccountId,
    );
    if (byAccount) return byAccount.isActive;

    const normalized = normalizeEmail(email);
    if (!normalized) return true;

    const byEmail = await userRepository.findAuthUserByEmail(normalized);
    return !byEmail || byEmail.isActive;
}
