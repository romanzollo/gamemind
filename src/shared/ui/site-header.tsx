import Link from 'next/link';

import type { Dictionary, Locale } from '@/shared/i18n';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme-toggle';

const links = [
    { href: '/', labelKey: 'home' },
    { href: '/quiz/setup', labelKey: 'quiz' },
    { href: '/leaderboard', labelKey: 'leaderboard' },
    { href: '/profile', labelKey: 'profile' },
    { href: '/admin/questions', labelKey: 'admin' },
    { href: '/login', labelKey: 'login' },
    { href: '/register', labelKey: 'register' },
] as const satisfies ReadonlyArray<{
    href: string;
    labelKey: keyof Dictionary['nav'];
}>;

type SiteHeaderProps = {
    locale: Locale;
    dictionary: Dictionary;
};

function localizedHref(locale: Locale, href: string) {
    return href === '/' ? `/${locale}` : `/${locale}${href}`;
}

export function SiteHeader({ locale, dictionary }: SiteHeaderProps) {
    return (
        <header className="border-b border-border">
            <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 p-4 text-sm">
                {links.map((link) => (
                    <Link
                        key={link.href}
                        href={localizedHref(locale, link.href)}
                        className="text-neutral-700 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
                    >
                        {dictionary.nav[link.labelKey]}
                    </Link>
                ))}

                <div className="ml-auto flex flex-wrap items-center gap-3">
                    <LanguageSwitcher
                        locale={locale}
                        labels={dictionary.language}
                    />
                    <ThemeToggle labels={dictionary.theme} />
                </div>
            </nav>
        </header>
    );
}
