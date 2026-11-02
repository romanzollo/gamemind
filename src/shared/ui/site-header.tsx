'use client';

import type { Role } from '@prisma/client';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import type { Dictionary, Locale } from '@/shared/i18n';
import { GameMindMark } from './game-mind-mark';
import { LanguageSwitcher } from './language-switcher';
import { isNavActive, navActiveClassName } from './nav-active';
import { PendingLink } from './pending-link';
import { getSiteSection, getSiteTabs } from './site-nav';
import type { ClientTheme } from './theme-client';
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
    /** Тема из cookie (layout) — серверный снимок для ThemeToggle. */
    theme: ClientTheme;
};

function localizedHref(locale: Locale, href: string) {
    return href === '/' ? `/${locale}` : `/${locale}${href}`;
}

const navLinkClassName =
    'shrink-0 rounded-md px-2 py-1 text-sm text-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Шапка: логотип, язык и тема — на любой ширине.
 * С `lg` — ещё пункты разделов (те же, что в нижней панели SiteTabBar)
 * и «Админ» для админа; на телефоне разделы живут в нижней панели,
 * админка — ссылкой в профиле.
 */
export function SiteHeader({
    locale,
    dictionary,
    user,
    authControls,
    theme,
}: SiteHeaderProps) {
    const pathname = usePathname();
    const activeSection = getSiteSection(pathname);
    const tabs = getSiteTabs(dictionary.nav, user !== null);
    const adminActive = isNavActive(pathname, '/admin');

    return (
        <header className="sticky top-0 z-50 border-b border-border bg-surface">
            <div className="relative mx-auto flex max-w-5xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
                <PendingLink
                    href={localizedHref(locale, '/')}
                    className="shrink-0 rounded-md font-display text-base font-semibold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                    <span className="inline-flex items-center gap-2">
                        <GameMindMark className="size-6 sm:size-7" />
                        {dictionary.metadata.title}
                    </span>
                </PendingLink>

                <nav
                    className="hidden min-w-0 flex-1 items-center gap-1 lg:flex"
                    aria-label={dictionary.common.mainNav}
                >
                    {tabs.map((tab) => {
                        const active = tab.section === activeSection;

                        return (
                            <PendingLink
                                key={tab.section}
                                href={localizedHref(locale, tab.href)}
                                className={navActiveClassName(
                                    active,
                                    navLinkClassName,
                                )}
                                aria-current={active ? 'page' : undefined}
                            >
                                {tab.label}
                            </PendingLink>
                        );
                    })}

                    {user?.role === 'ADMIN' ? (
                        <PendingLink
                            href={localizedHref(locale, '/admin')}
                            className={navActiveClassName(
                                adminActive,
                                navLinkClassName,
                            )}
                            aria-current={adminActive ? 'page' : undefined}
                        >
                            {dictionary.nav.admin}
                        </PendingLink>
                    ) : null}
                </nav>

                <div className="flex-1 lg:hidden" aria-hidden />

                <div className="flex shrink-0 items-center gap-2 lg:gap-3">
                    <div className="flex items-center gap-1 sm:gap-2">
                        <LanguageSwitcher
                            locale={locale}
                            labels={dictionary.language}
                        />
                        <ThemeToggle
                            labels={dictionary.theme}
                            initialTheme={theme}
                        />
                    </div>

                    <div className="flex items-center gap-2 lg:border-l lg:border-border lg:pl-3">
                        {authControls}
                    </div>
                </div>
            </div>
        </header>
    );
}
