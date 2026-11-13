import NextAuth from 'next-auth';
import {
    authMethodOf,
    recordServerEvent,
} from '@/entities/analytics-event/record-server-event';
import { userRepository } from '@/entities/user/user.repository';
import { awardAchievementsForUser } from '@/features/achievements/lib/award-achievements-for-user';
import { authConfig } from './auth.config';
import { createGameMindAdapter, isOAuthSignInAllowed } from './adapter';
import {
    credentialsProvider,
    guestProvider,
    isYandexSignInEnabled,
    yandexProvider,
} from './providers';
import { refreshImportedAvatar } from './oauth-avatar';
import {
    isVkIdSignInEnabled,
    readVkIdAvatar,
    VK_ID_PROVIDER_ID,
    vkIdProvider,
} from './vk-id';

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
    ...authConfig,
    // Адаптер нужен только внешнему входу; сессии остаются JWT (authConfig).
    adapter: createGameMindAdapter(),
    providers: [
        credentialsProvider,
        guestProvider,
        ...(isYandexSignInEnabled ? [yandexProvider] : []),
        ...(isVkIdSignInEnabled ? [vkIdProvider] : []),
    ],
    callbacks: {
        ...authConfig.callbacks,
        async signIn({ user, account, profile }) {
            if (account?.type !== 'oauth' && account?.type !== 'oidc') {
                return true;
            }

            if (!(await isOAuthSignInAllowed(account, user.email))) {
                return false;
            }

            // Старая ссылка VK на фото протухла — берём свежую из этого входа.
            // До создания сессии: JWT прочитает аватар уже из БД.
            if (account.provider === VK_ID_PROVIDER_ID) {
                await refreshImportedAvatar(account, readVkIdAvatar(profile));
            }

            return true;
        },

        /**
         * Гость вошёл в свой аккаунт — Яндекс, VK или пароль, новый или
         * существующий: забираем его игры (3.4). Здесь, а не в events:
         * Auth.js глотает ошибки событий, а ошибка в jwt срывает вход —
         * гость остаётся гостем, повторный вход доносит остальное.
         *
         * auth() ещё читает старую, гостевую сессию из cookie запроса —
         * новая уйдёт только с ответом. Регистрация гостя по паролю
         * сюда не попадает: там та же строка (id совпадает).
         */
        async jwt(params) {
            const { user, trigger, account } = params;

            if (
                user?.id &&
                !user.isGuest &&
                (trigger === 'signIn' || trigger === 'signUp')
            ) {
                const merged = await claimPreviousGuest(user.id);
                recordAuthFunnelEvent({
                    userId: user.id,
                    isNewAccount: trigger === 'signUp',
                    merged,
                    method: authMethodOf(account?.provider),
                });
            }

            return authConfig.callbacks.jwt(params);
        },
    },
});

/**
 * Воронка 3.5: новый аккаунт через Яндекс / VK (`signup`) или гость вошёл в
 * существующий аккаунт (`guest_merged`). Регистрацию по паролю пишет
 * registerAction: Auth.js её как `signUp` не видит. Обычный вход в свой
 * аккаунт — не событие.
 */
function recordAuthFunnelEvent(input: {
    userId: string;
    isNewAccount: boolean;
    merged: boolean;
    method: ReturnType<typeof authMethodOf>;
}): void {
    const { userId, isNewAccount, merged, method } = input;
    if (!method) return;

    if (isNewAccount) {
        recordServerEvent(
            { name: 'signup', props: { method, wasGuest: merged } },
            userId,
        );
    } else if (merged) {
        recordServerEvent({ name: 'guest_merged', props: { method } }, userId);
    }
}

/**
 * Перенос игр гостя, из-под сессии которого вошли в аккаунт userId.
 * `true` — гость был и его данные перенесены.
 */
async function claimPreviousGuest(userId: string): Promise<boolean> {
    const previous = await auth();
    if (!previous?.user.isGuest || previous.user.id === userId) return false;

    const merged = await userRepository.mergeGuestInto(
        previous.user.id,
        userId,
    );

    // Партии гостя могли открыть новые достижения уже у аккаунта.
    if (merged === 'merged') {
        await awardAchievementsForUser(userId);
    }

    return merged === 'merged';
}
