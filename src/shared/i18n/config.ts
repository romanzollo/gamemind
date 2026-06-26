export const locales = ['ru', 'en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ru';

export function isLocale(value: string): value is Locale {
    return locales.includes(value as Locale);
}

export function getLocaleFromPathname(pathname: string): Locale | null {
    const locale = pathname.split('/')[1];

    return locale && isLocale(locale) ? locale : null;
}

export function removeLocaleFromPathname(pathname: string) {
    const locale = getLocaleFromPathname(pathname);

    if (!locale) {
        return pathname;
    }

    const pathnameWithoutLocale = pathname.slice(`/${locale}`.length);

    return pathnameWithoutLocale || '/';
}
