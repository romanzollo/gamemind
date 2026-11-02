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

    // Server Actions POST to the page URL. A plain NextResponse.redirect() here
    // returns HTML/login instead of an RSC action payload → client error:
    // "An unexpected response was received from the server."
    // Auth for mutations stays in requireUser/requireAdmin inside the actions.
    const isServerAction =
        request.method === 'POST' &&
        (request.headers.has('next-action') ||
            request.headers.has('Next-Action'));

    if (isServerAction) {
        return NextResponse.next();
    }

    if (!locale) {
        const redirectUrl = nextUrl.clone();
        redirectUrl.pathname =
            nextUrl.pathname === '/'
                ? `/${defaultLocale}`
                : `/${defaultLocale}${nextUrl.pathname}`;

        return NextResponse.redirect(redirectUrl);
    }

    const pathnameWithoutLocale = removeLocaleFromPathname(nextUrl.pathname);

    // Бывшее лобби (/quiz и legacy /quiz/setup) → главная, ADR «Home is the
    // play hub». Здесь, а не только в page: страница стримится (loading.tsx),
    // и её redirect() приходит 200 + клиентским переходом, а не 307.
    // POST Server Action сюда не доходит (выше) — его ловит сама страница.
    if (
        pathnameWithoutLocale === '/quiz' ||
        pathnameWithoutLocale === '/quiz/setup'
    ) {
        const redirectUrl = nextUrl.clone();
        redirectUrl.pathname = `/${locale}`;
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
