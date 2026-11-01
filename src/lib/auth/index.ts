import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { createGameMindAdapter, isOAuthSignInAllowed } from './adapter';
import {
    credentialsProvider,
    isYandexSignInEnabled,
    yandexProvider,
} from './providers';

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
    ...authConfig,
    // Адаптер нужен только внешнему входу; сессии остаются JWT (authConfig).
    adapter: createGameMindAdapter(),
    providers: [
        credentialsProvider,
        ...(isYandexSignInEnabled ? [yandexProvider] : []),
    ],
    callbacks: {
        ...authConfig.callbacks,
        async signIn({ user, account }) {
            if (account?.type !== 'oauth' && account?.type !== 'oidc') {
                return true;
            }

            return isOAuthSignInAllowed(account, user.email);
        },
    },
});
