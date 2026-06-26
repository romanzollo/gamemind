import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/auth.config';

const { auth } = NextAuth(authConfig);

export const proxy = auth(() => {
    // Защита маршрутов обрабатывается callback authorized в authConfig.
});

export const config = {
    matcher: ['/profile/:path*', '/admin/:path*'],
};
