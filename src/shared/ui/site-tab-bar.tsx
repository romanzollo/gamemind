/**
 * Нижняя панель вкладок на телефоне (П11): Играть / Рейтинг / Профиль.
 *
 * Client — только ради usePathname (активная вкладка и скрытие на экране
 * партии). Список вкладок собирает Server Layout (`getSiteTabs`).
 * С `lg` панели нет: те же пункты живут в шапке.
 *
 * Панель fixed, поэтому рядом в потоке стоит распорка той же высоты —
 * иначе низ любой страницы уходил бы под панель.
 */
'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import type { Locale } from '@/shared/i18n';
import { PendingLink } from './pending-link';
import {
    getSiteSection,
    isGameScreen,
    type SiteSection,
    type SiteTab,
} from './site-nav';

type SiteTabBarProps = {
    locale: Locale;
    tabs: ReadonlyArray<SiteTab>;
    /** Подпись landmark для скринридера. */
    label: string;
};

function localizedHref(locale: Locale, href: string) {
    return href === '/' ? `/${locale}` : `/${locale}${href}`;
}

const iconProps = {
    'aria-hidden': true,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'size-6',
} as const;

const TAB_ICONS: Record<SiteSection, ReactNode> = {
    // Геймпад: раздел игры.
    play: (
        <svg {...iconProps}>
            <rect x="2.5" y="6.5" width="19" height="11" rx="5.5" />
            <path d="M7.5 10.5v3M6 12h3" />
            <path d="M15.5 11h.01M17.5 13h.01" />
        </svg>
    ),
    // Пьедестал: места в рейтинге.
    leaderboard: (
        <svg {...iconProps}>
            <path d="M9 20V8h6v12" />
            <path d="M3.5 20v-7H9M15 15.5h5.5V20" />
            <path d="M2.5 20h19" />
        </svg>
    ),
    profile: (
        <svg {...iconProps}>
            <circle cx="12" cy="8.5" r="3.75" />
            <path d="M4.5 20c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5" />
        </svg>
    ),
};

export function SiteTabBar({ locale, tabs, label }: SiteTabBarProps) {
    const pathname = usePathname();

    if (isGameScreen(pathname)) {
        return null;
    }

    const activeSection = getSiteSection(pathname);

    return (
        <>
            <div
                aria-hidden
                className="h-[calc(var(--site-tab-bar-height)+env(safe-area-inset-bottom))] lg:hidden"
            />
            <nav
                aria-label={label}
                className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
            >
                <ul className="mx-auto grid h-[var(--site-tab-bar-height)] max-w-lg grid-cols-3">
                    {tabs.map((tab) => {
                        const active = tab.section === activeSection;

                        return (
                            <li key={tab.section} className="flex">
                                <PendingLink
                                    href={localizedHref(locale, tab.href)}
                                    aria-current={active ? 'page' : undefined}
                                    className={`w-full justify-center text-2xs leading-none transition focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring ${
                                        active
                                            ? 'font-semibold text-foreground'
                                            : 'text-muted hover:text-foreground'
                                    }`}
                                >
                                    <span className="flex flex-col items-center gap-1">
                                        <span
                                            className={`flex h-7 w-14 items-center justify-center rounded-full transition ${
                                                active
                                                    ? 'bg-surface-muted text-primary'
                                                    : ''
                                            }`}
                                        >
                                            {TAB_ICONS[tab.section]}
                                        </span>
                                        {tab.label}
                                    </span>
                                </PendingLink>
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </>
    );
}
