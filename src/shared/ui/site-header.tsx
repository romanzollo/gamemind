import Link from 'next/link';
import type { Role } from '@prisma/client';
import type { ReactNode } from 'react';

import type { Dictionary, Locale } from '@/shared/i18n';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';

type NavUser = {
    username: string;
    role: Role;
};

type SiteHeaderProps = {
    locale: Locale;
    dictionary: Dictionary;
    user: NavUser | null;
    authControls: ReactNode;
};

type NavLinkItem = {
    href: string;
    labelKey: keyof Dictionary['nav'];
};

function localizedHref(locale: Locale, href: string) {
    return href === '/' ? `/${locale}` : `/${locale}${href}`;
}

function getMainLinks(user: NavUser | null): ReadonlyArray<NavLinkItem> {
    const links: NavLinkItem[] = [
        { href: '/', labelKey: 'home' },
        { href: '/quiz', labelKey: 'quiz' },
    ];

    if (user) {
        links.push(
            { href: '/leaderboard', labelKey: 'leaderboard' },
            { href: '/profile', labelKey: 'profile' },
        );

        if (user.role === 'ADMIN') {
            links.push({ href: '/admin/questions', labelKey: 'admin' });
        }
    }

    return links;
}

const navLinkClassName =
    'rounded-md px-2 py-1 text-sm text-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function SiteHeader({
    locale,
    dictionary,
    user,
    authControls,
}: SiteHeaderProps) {
    const mainLinks = getMainLinks(user);

    return (
        <header className="border-b border-border bg-surface/80 backdrop-blur-sm">
            <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3">
                <Link
                    href={localizedHref(locale, '/')}
                    className="shrink-0 text-base font-semibold tracking-tight text-foreground"
                >
                    GameMind
                </Link>

                <div className="flex flex-wrap items-center gap-1">
                    {mainLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={localizedHref(locale, link.href)}
                            className={navLinkClassName}
                        >
                            {dictionary.nav[link.labelKey]}
                        </Link>
                    ))}
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2 sm:gap-3">
                    {authControls}

                    <div className="flex items-center gap-2 border-l border-border pl-2 sm:pl-3">
                        <LanguageSwitcher
                            locale={locale}
                            labels={dictionary.language}
                        />
                        <ThemeToggle labels={dictionary.theme} />
                    </div>
                </div>
            </nav>
        </header>
    );
}
