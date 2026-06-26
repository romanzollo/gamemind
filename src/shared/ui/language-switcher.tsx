'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { locales, type Locale } from '@/shared/i18n';

type LanguageSwitcherProps = {
    locale: Locale;
    labels: {
        label: string;
        ru: string;
        en: string;
    };
};

function getLocalizedHref(pathname: string, nextLocale: Locale) {
    const segments = pathname.split('/');

    if (locales.includes(segments[1] as Locale)) {
        segments[1] = nextLocale;
        return segments.join('/') || `/${nextLocale}`;
    }

    return `/${nextLocale}${pathname === '/' ? '' : pathname}`;
}

export function LanguageSwitcher({ locale, labels }: LanguageSwitcherProps) {
    const pathname = usePathname();

    return (
        <div
            className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
            aria-label={labels.label}
        >
            <span>{labels.label}:</span>
            {locales.map((nextLocale) => (
                <Link
                    key={nextLocale}
                    href={getLocalizedHref(pathname, nextLocale)}
                    aria-current={nextLocale === locale ? 'page' : undefined}
                    className={
                        nextLocale === locale
                            ? 'font-semibold text-neutral-950 dark:text-white'
                            : 'hover:text-neutral-950 dark:hover:text-white'
                    }
                >
                    {labels[nextLocale]}
                </Link>
            ))}
        </div>
    );
}
