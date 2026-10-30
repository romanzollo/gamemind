'use client';

import type { Role } from '@prisma/client';

import type { Dictionary, Locale } from '@/shared/i18n';
import { SiteHeader } from '@/shared/ui';
import type { ClientTheme } from '@/shared/ui/theme-client';

import { HeaderAuthControls } from './HeaderAuthControls';

type AppSiteHeaderUser = {
    username: string;
    role: Role;
    image?: string | null;
};

type AppSiteHeaderProps = {
    locale: Locale;
    dictionary: Dictionary;
    user: AppSiteHeaderUser | null;
    /** Тема из cookie — чтобы кнопка темы совпала с SSR. */
    theme: ClientTheme;
};

/**
 * Client chrome wrapper: создаёт auth-слоты уже на клиенте.
 * Нельзя передавать JSX-слоты из Server Layout в SiteHeader —
 * React тогда ругается на unique "key" (RSC→Client children list).
 */
export function AppSiteHeader({
    locale,
    dictionary,
    user,
    theme,
}: AppSiteHeaderProps) {
    const navUser = user
        ? { username: user.username, role: user.role }
        : null;

    return (
        <SiteHeader
            locale={locale}
            dictionary={dictionary}
            user={navUser}
            theme={theme}
            authControls={
                <HeaderAuthControls
                    locale={locale}
                    dictionary={dictionary}
                    user={user}
                    variant="bar"
                />
            }
            mobileAuthControls={
                <HeaderAuthControls
                    locale={locale}
                    dictionary={dictionary}
                    user={user}
                    variant="menu"
                />
            }
        />
    );
}
