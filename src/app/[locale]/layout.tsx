import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { AppSiteHeader } from '@/features/auth/components/AppSiteHeader';
import { auth } from '@/lib/auth';
import { getDictionary, isLocale, locales, type Locale } from '@/shared/i18n';

import '../globals.css';

type LocaleLayoutProps = Readonly<{
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}>;

// генерация статических путей для всех локалей
export function generateStaticParams() {
    return locales.map((locale) => ({ locale }));
}

// генерирует метаданные для страницы
export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;

    if (!isLocale(locale)) {
        return {};
    }

    // получаем словарь для локали
    const dictionary = getDictionary(locale);

    return {
        title: dictionary.metadata.title,
        description: dictionary.metadata.description,
    };
}

// получает куку для темы
function getThemeCookie(value: string | undefined) {
    return value === 'dark' ? 'dark' : 'light';
}

// основной компонент для страницы
export default async function LocaleLayout({
    children,
    params,
}: LocaleLayoutProps) {
    // получаем локаль из параметров
    const { locale } = await params;

    // проверяем, является ли локаль валидной
    if (!isLocale(locale)) {
        notFound();
    }

    // получаем словарь для локали
    const dictionary = getDictionary(locale as Locale);
    // получаем куку для темы
    const cookieStore = await cookies();
    // получаем тему из куки
    const theme = getThemeCookie(cookieStore.get('theme')?.value);
    const session = await auth();
    const navUser = session?.user
        ? {
              username: session.user.username,
              role: session.user.role,
              image: session.user.image ?? null,
          }
        : null;

    return (
        <html lang={locale} data-theme={theme} suppressHydrationWarning>
            <body className="antialiased" suppressHydrationWarning>
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:border focus:border-border focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-2 focus:outline-offset-2 focus:outline-ring"
                >
                    {dictionary.common.skipToContent}
                </a>
                <AppSiteHeader
                    locale={locale}
                    dictionary={dictionary}
                    user={navUser}
                />
                {/*
                  Цель skip-ссылки. Страницы сами держат свой <main> —
                  не оборачивая children во второй <main>.
                */}
                <div id="main-content" tabIndex={-1}>
                    {children}
                </div>
            </body>
        </html>
    );
}
