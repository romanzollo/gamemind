import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Geist, Geist_Mono } from 'next/font/google';

import {
    getDictionary,
    isLocale,
    locales,
    type Locale,
} from '@/shared/i18n';
import { SiteHeader } from '@/shared/ui';

import '../globals.css';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin', 'cyrillic'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin', 'cyrillic'],
});

type LocaleLayoutProps = Readonly<{
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}>;

export function generateStaticParams() {
    return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;

    if (!isLocale(locale)) {
        return {};
    }

    const dictionary = getDictionary(locale);

    return {
        title: dictionary.metadata.title,
        description: dictionary.metadata.description,
    };
}

function getThemeCookie(value: string | undefined) {
    return value === 'dark' ? 'dark' : 'light';
}

export default async function LocaleLayout({
    children,
    params,
}: LocaleLayoutProps) {
    const { locale } = await params;

    if (!isLocale(locale)) {
        notFound();
    }

    const dictionary = getDictionary(locale as Locale);
    const cookieStore = await cookies();
    const theme = getThemeCookie(cookieStore.get('theme')?.value);

    return (
        <html lang={locale} data-theme={theme} suppressHydrationWarning>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <SiteHeader locale={locale} dictionary={dictionary} />
                {children}
            </body>
        </html>
    );
}
