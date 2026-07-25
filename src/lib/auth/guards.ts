import { redirect } from 'next/navigation';

import { userRepository } from '@/entities/user/user.repository';
import { auth } from '@/lib/auth';
import { defaultLocale, type Locale } from '@/shared/i18n';

export async function requireUser(locale: Locale = defaultLocale) {
    const session = await auth();

    if (!session?.user?.id) {
        redirect(`/${locale}/login`);
    }

    const user = await userRepository.findSessionUserById(session.user.id);

    if (!user || !user.isActive) {
        redirect(`/${locale}/login`);
    }

    return {
        ...session,
        user: {
            ...session.user,
            id: user.id,
            name: user.username,
            username: user.username,
            email: user.email,
            role: user.role,
            image: user.image,
        },
    };
}

export async function requireAdmin(locale: Locale = defaultLocale) {
    const session = await requireUser(locale);

    if (session.user.role !== 'ADMIN') {
        redirect(`/${locale}/profile`);
    }

    return session;
}
