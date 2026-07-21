'use client';

import type { Role } from '@prisma/client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import type { Dictionary, Locale } from '@/shared/i18n';
import { LanguageSwitcher } from './language-switcher';
import { isNavActive, navActiveClassName } from './nav-active';
import { PendingLink } from './pending-link';
import { SiteMobileMenu } from './site-mobile-menu';
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
    mobileAuthControls: ReactNode;
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
            links.push({ href: '/admin', labelKey: 'admin' });
        }
    }

    return links;
}

const navLinkClassName =
    'shrink-0 rounded-md px-2 py-1 text-sm text-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function SiteHeader({
    locale,
    dictionary,
    user,
    authControls,
    mobileAuthControls,
}: SiteHeaderProps) {
    const pathname = usePathname();
    const mainLinks = getMainLinks(user);
    const mobileLinks = mainLinks.map((link) => ({
        href: link.href,
        label: dictionary.nav[link.labelKey],
    }));

    // Не переиспользовать один и тот же React element в двух местах —
    // RSC→Client слот тогда даёт warning про unique "key".
    const desktopUtilities = (
        <div className="hidden items-center gap-1 sm:gap-2 lg:flex">
            <LanguageSwitcher locale={locale} labels={dictionary.language} />
            <ThemeToggle labels={dictionary.theme} />
        </div>
    );
    const menuUtilities = (
        <div className="flex items-center gap-1 sm:gap-2">
            <LanguageSwitcher locale={locale} labels={dictionary.language} />
            <ThemeToggle labels={dictionary.theme} />
        </div>
    );

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-surface">
            <div className="relative mx-auto flex max-w-5xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                <PendingLink
                    href={localizedHref(locale, '/')}
                    className="shrink-0 text-base font-semibold tracking-tight text-foreground"
                >
                    GameMind
                </PendingLink>

                <nav
                    className="hidden min-w-0 flex-1 items-center gap-1 lg:flex"
                    aria-label={dictionary.common.mainNav}
                >
                    {mainLinks.map((link) => {
                        const active = isNavActive(pathname, link.href);

                        return (
                            <PendingLink
                                key={link.href}
                                href={localizedHref(locale, link.href)}
                                className={navActiveClassName(
                                    active,
                                    navLinkClassName,
                                )}
                                aria-current={active ? 'page' : undefined}
                            >
                                {dictionary.nav[link.labelKey]}
                            </PendingLink>
                        );
                    })}
                </nav>

                <div className="flex-1 lg:hidden" aria-hidden />

                <div className="flex shrink-0 items-center gap-2">
                    {/*
                      Один экземпляр authControls: на mobile bar — аватар,
                      login/logout прячутся классами внутри HeaderAuthControls.
                    */}
                    <div className="flex items-center gap-2 lg:gap-3 lg:border-l lg:border-border lg:pl-3">
                        {authControls}
                        {desktopUtilities}
                    </div>

                    <SiteMobileMenu
                        locale={locale}
                        links={mobileLinks}
                        openLabel={dictionary.common.openMenu}
                        closeLabel={dictionary.common.closeMenu}
                        mainNavLabel={dictionary.common.mainNav}
                        menuAuth={mobileAuthControls}
                        menuUtilities={menuUtilities}
                    />
                </div>
            </div>
        </header>
    );
}
