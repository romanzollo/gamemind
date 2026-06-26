import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { defaultLocale, type Locale } from '@/shared/i18n';

export async function requireUser(locale: Locale = defaultLocale) {
    const session = await auth();

    if (!session?.user) {
        redirect(`/${locale}/login`);
    }

    return session;
}

export async function requireAdmin(locale: Locale = defaultLocale) {
    const session = await requireUser(locale);

    if (session.user.role !== 'ADMIN') {
        redirect(`/${locale}/profile`);
    }

    return session;
}
