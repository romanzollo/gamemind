import bcrypt from 'bcryptjs';
import { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Yandex, { type YandexProfile } from 'next-auth/providers/yandex';
import { loginSchema } from '@/features/auth/lib/validation';
import { userRepository } from '@/entities/user/user.repository';
import { checkSharedPresetRateLimit } from '@/lib/rate-limit-shared';
import { getIpRateLimitIdentity } from '@/lib/rate-limit-key';
import { createGuestUsername } from './oauth-username';

export const credentialsProvider = Credentials({
    id: 'credentials',
    name: 'credentials',
    credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
        // Шаг 1: Валидация данных
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
            return null;
        }

        // Шаг 2: Извлечение валидированных данных
        const { email, password } = parsed.data;

        // Шаг 3: Поиск пользователя в БД
        const user = await userRepository.findByEmailForLogin(email);

        // Шаг 4: Проверка существования пользователя
        if (!user || !user.passwordHash) {
            return null;
        }

        // Soft-disable: неактивный пользователь не входит
        if (!user.isActive) {
            return null;
        }

        // Шаг 5: Сравнение паролей
        const isPasswordValid = await bcrypt.compare(
            password,
            user.passwordHash,
        );

        if (!isPasswordValid) {
            return null;
        }

        // Шаг 6: Успешный вход - возвращаем объект пользователя
        return {
            id: user.id,
            email: user.email,
            name: user.username,
            image: user.image,
            role: user.role,
        };
    },
});

/** Лимит гостей с IP исчерпан — отдельный код, чтобы форма сказала «подожди». */
export class GuestRateLimited extends CredentialsSignin {
    code = 'guest_rate_limited';
}

/**
 * Гость (3.4): новая строка `User` с `isGuest = true`, без почты и пароля,
 * и обычная JWT-сессия. Лимит по IP — здесь, а не в action: иначе его обошёл
 * бы прямой POST на /api/auth/callback/guest. Ник занят (1 к 2 млрд) —
 * пробуем ещё раз. Canon: DECISIONS → Accounts without a password.
 */
export const guestProvider = Credentials({
    id: 'guest',
    name: 'guest',
    credentials: {},
    async authorize() {
        const rate = await checkSharedPresetRateLimit(
            'guest',
            await getIpRateLimitIdentity(),
        );
        if (!rate.ok) {
            throw new GuestRateLimited();
        }

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const row = await userRepository.createGuestUser(
                createGuestUsername(),
            );

            if (row !== 'taken') {
                return {
                    id: row.id,
                    name: row.username,
                    email: null,
                    image: null,
                    role: row.role,
                    isGuest: true,
                };
            }
        }

        throw new Error('GUEST_USERNAME_EXHAUSTED');
    },
});

/**
 * Вход через Яндекс ID. Включается, только когда заданы `AUTH_YANDEX_ID`
 * и `AUTH_YANDEX_SECRET` (Auth.js читает их сам) — без ключей кнопки нет.
 *
 * Почту Яндекс отдаёт подтверждённой, поэтому вход привязывается
 * к существующему аккаунту с той же почтой (allowDangerousEmailAccountLinking).
 * Ник берём из логина Яндекса (латиница), а не из имени — меньше
 * транслитерации. Canon: DECISIONS → Accounts without a password.
 */
export const isYandexSignInEnabled = Boolean(
    process.env.AUTH_YANDEX_ID && process.env.AUTH_YANDEX_SECRET,
);

export const yandexProvider = Yandex({
    allowDangerousEmailAccountLinking: true,
    profile(profile: YandexProfile) {
        return {
            id: profile.id,
            name: profile.login || profile.display_name,
            email: profile.default_email ?? profile.emails?.[0] ?? null,
            image:
                !profile.is_avatar_empty && profile.default_avatar_id
                    ? `https://avatars.yandex.net/get-yapic/${profile.default_avatar_id}/islands-200`
                    : null,
            // Роль провайдер не задаёт: адаптер её не пишет, в JWT попадает
            // роль из БД. Поле нужно только для типа User.
            role: 'USER',
        };
    },
});
