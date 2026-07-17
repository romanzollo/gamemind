import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@prisma/client';

export const authConfig = {
    trustHost: true,
    providers: [],
    pages: {
        signIn: '/ru/login',
    },
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
        authorized() {
            // Locale-aware redirects are handled in src/proxy.ts.
            return true;
        },

        jwt({ token, user, trigger, session }) {
            if (user) {
                token.id = user.id!;
                token.role = user.role as Role;
                token.username = user.name ?? '';
                // Auth.js хранит аватар в JWT как picture
                token.picture = user.image ?? undefined;
            }

            // Обновление сессии после смены профиля (unstable_update)
            if (trigger === 'update' && session?.user) {
                if (typeof session.user.username === 'string') {
                    token.username = session.user.username;
                }

                // image может быть string | null (сброс аватара) —
                // проверяем наличие ключа, а не truthy
                if ('image' in session.user) {
                    token.picture = session.user.image ?? undefined;
                }
            }

            return token;
        },

        session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as Role;
                session.user.username = token.username as string;
                session.user.image =
                    (token.picture as string | undefined) ?? null;
            }

            return session;
        },
    },
} satisfies NextAuthConfig;
