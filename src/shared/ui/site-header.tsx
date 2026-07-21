import type { Role } from '@prisma/client';
import type { ReactNode } from 'react';

import type { Dictionary, Locale } from '@/shared/i18n';
import { LanguageSwitcher } from './language-switcher';
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

/** Full desktop chrome from lg (1024px); below that — hamburger. */
const DESKTOP = 'lg';

export function SiteHeader({
    locale,
    dictionary,
    user,
    authControls,
    mobileAuthControls,
}: SiteHeaderProps) {
    const mainLinks = getMainLinks(user);
    const mobileLinks = mainLinks.map((link) => ({
        href: link.href,
        label: dictionary.nav[link.labelKey],
    }));

    const utilities = (
        <>
            <LanguageSwitcher locale={locale} labels={dictionary.language} />
            <ThemeToggle labels={dictionary.theme} />
        </>
    );

    return (
        <header className="sticky top-0 z-40 border-b border-border bg-surface">
            <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                <PendingLink
                    href={localizedHref(locale, '/')}
                    className="shrink-0 text-base font-semibold tracking-tight text-foreground"
                >
                    GameMind
                </PendingLink>

                <nav
                    className="hidden min-w-0 flex-1 items-center gap-1 lg:flex"
                    aria-label="Main"
                >
                    {mainLinks.map((link) => (
                        <PendingLink
                            key={link.href}
                            href={localizedHref(locale, link.href)}
                            className={navLinkClassName}
                        >
                            {dictionary.nav[link.labelKey]}
                        </PendingLink>
                    ))}
                </nav>

                <div className="flex-1 lg:hidden" aria-hidden />

                <div className="flex shrink-0 items-center gap-2">
                    <div className="hidden items-center gap-3 border-l border-border pl-3 lg:flex">
                        {authControls}
                        {utilities}
                    </div>

                    {/* Mobile / tablet: avatar only; links + logout in ☰ */}
                    <div className="lg:hidden">{authControls}</div>

                    <SiteMobileMenu
                        locale={locale}
                        links={mobileLinks}
                        openLabel={dictionary.common.openMenu}
                        closeLabel={dictionary.common.closeMenu}
                        menuAuth={mobileAuthControls}
                        menuUtilities={utilities}
                    />
                </div>
            </div>
        </header>
    );
}
