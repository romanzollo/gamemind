import type { NextAuthConfig } from 'next-auth';
import type { Role } from '@prisma/client';

export const authConfig = {
    trustHost: true,
    providers: [],
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = Boolean(auth?.user);
            const isProtected =
                nextUrl.pathname.startsWith('/profile') ||
                nextUrl.pathname.startsWith('/admin');

            if (isProtected) {
                return isLoggedIn;
            }

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
