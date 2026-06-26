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
            // Проверяем, авторизован ли пользователь
            const isLoggedIn = Boolean(auth?.user);

            // Проверяем, является ли маршрут админской зоной
            const isAdminRoute = nextUrl.pathname.startsWith('/admin');

            // Проверяем, является ли маршрут защищенной зоной
            const isProtectedRoute =
                nextUrl.pathname.startsWith('/profile') ||
                nextUrl.pathname.startsWith('/admin');

            // Если маршрут админской зоны, проверяем, является ли пользователь админом
            if (isAdminRoute) {
                return auth?.user?.role === 'ADMIN';
            }
            // Если маршрут защищенной зоны, проверяем, авторизован ли пользователь
            if (isProtectedRoute) {
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
