import NextAuth from 'next-auth';
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
    },
});
