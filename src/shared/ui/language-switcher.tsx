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
            className="flex items-center gap-1 text-sm text-muted sm:gap-2"
            aria-label={labels.label}
        >
            <span className="hidden sm:inline">{labels.label}:</span>
            {locales.map((nextLocale) => (
                <Link
                    key={nextLocale}
                    href={getLocalizedHref(pathname, nextLocale)}
                    aria-current={nextLocale === locale ? 'page' : undefined}
                    className={[
                        'rounded-md px-1.5 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        nextLocale === locale
                            ? 'font-semibold text-foreground'
                            : 'hover:bg-surface-muted hover:text-foreground',
                    ].join(' ')}
                >
                    {labels[nextLocale]}
                </Link>
            ))}
        </div>
    );
}
