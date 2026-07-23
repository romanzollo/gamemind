'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { locales, type Locale } from '@/shared/i18n';

/**
 * Переключатель языка: меняет только сегмент locale в path.
 * Query (фильтры admin и т.п.) сохраняем — иначе /questions?difficulty=EASY
 * при смене ru→en сбрасывался бы в чистый /questions.
 */

type LanguageSwitcherProps = {
    locale: Locale;
    labels: {
        label: string;
        ru: string;
        en: string;
    };
};

function getLocalizedHref(
    pathname: string,
    nextLocale: Locale,
    search: string,
) {
    const segments = pathname.split('/');
    let href: string;

    if (locales.includes(segments[1] as Locale)) {
        segments[1] = nextLocale;
        href = segments.join('/') || `/${nextLocale}`;
    } else {
        href = `/${nextLocale}${pathname === '/' ? '' : pathname}`;
    }

    return search ? `${href}?${search}` : href;
}

function LanguageSwitcherLinks({ locale, labels }: LanguageSwitcherProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const search = searchParams.toString();

    return (
        <div
            className="flex items-center gap-1 text-sm text-muted sm:gap-2"
            aria-label={labels.label}
        >
            <span className="hidden sm:inline">{labels.label}:</span>
            {locales.map((nextLocale) => (
                <Link
                    key={nextLocale}
                    href={getLocalizedHref(pathname, nextLocale, search)}
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

/** Fallback без query — пока Suspense читает searchParams (редко видно). */
function LanguageSwitcherFallback({ locale, labels }: LanguageSwitcherProps) {
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
                    href={getLocalizedHref(pathname, nextLocale, '')}
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

export function LanguageSwitcher(props: LanguageSwitcherProps) {
    return (
        <Suspense fallback={<LanguageSwitcherFallback {...props} />}>
            <LanguageSwitcherLinks {...props} />
        </Suspense>
    );
}
