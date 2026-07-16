import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/auth.config';
import {
    defaultLocale,
    getLocaleFromPathname,
    removeLocaleFromPathname,
} from '@/shared/i18n';

const { auth } = NextAuth(authConfig);

export const proxy = auth((request) => {
    const { auth: session, nextUrl } = request;
    const locale = getLocaleFromPathname(nextUrl.pathname);

    if (!locale) {
        const redirectUrl = nextUrl.clone();
        redirectUrl.pathname =
            nextUrl.pathname === '/'
                ? `/${defaultLocale}`
                : `/${defaultLocale}${nextUrl.pathname}`;

        return NextResponse.redirect(redirectUrl);
    }

    const pathnameWithoutLocale = removeLocaleFromPathname(nextUrl.pathname);

    // Legacy URL: /:locale/quiz/setup → /:locale/quiz
    if (pathnameWithoutLocale === '/quiz/setup') {
        const redirectUrl = nextUrl.clone();
        redirectUrl.pathname = `/${locale}/quiz`;
        return NextResponse.redirect(redirectUrl);
    }

    const isAdminRoute = pathnameWithoutLocale.startsWith('/admin');
    const isProtectedRoute =
        pathnameWithoutLocale.startsWith('/profile') || isAdminRoute;

    if (!isProtectedRoute) {
        return NextResponse.next();
    }

    if (!session?.user) {
        const loginUrl = nextUrl.clone();
        loginUrl.pathname = `/${locale}/login`;
        loginUrl.searchParams.set('callbackUrl', nextUrl.pathname);

        return NextResponse.redirect(loginUrl);
    }

    if (isAdminRoute && session.user.role !== 'ADMIN') {
        const profileUrl = nextUrl.clone();
        profileUrl.pathname = `/${locale}/profile`;
        profileUrl.search = '';

        return NextResponse.redirect(profileUrl);
    }

    return NextResponse.next();
});

export const config = {
    matcher: ['/((?!api|_next|favicon.ico|.*\\..*).*)'],
};
