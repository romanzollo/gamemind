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

        jwt({ token, user }) {
            if (user) {
                token.id = user.id!;
                token.role = user.role as Role;
                token.username = user.name ?? '';
            }

            return token;
        },

        session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as Role;
                session.user.username = token.username as string;
            }

            return session;
        },
    },
} satisfies NextAuthConfig;
