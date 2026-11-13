/**
 * Подвал сайта: копирайт, «Правообладателям» и «Что мы собираем».
 *
 * Одна тихая строка под содержимым страницы, над распоркой нижней панели
 * вкладок (`SiteTabBar` ставит её в поток сразу после подвала). Серверный
 * компонент: ни состояния, ни событий.
 */

import Link from 'next/link';

import type { Dictionary, Locale } from '@/shared/i18n';

type SiteFooterProps = {
    locale: Locale;
    labels: Dictionary['rights'];
    privacyLabel: string;
};

export function SiteFooter({ locale, labels, privacyLabel }: SiteFooterProps) {
    const copyright = labels.footerCopyright.replace(
        '{year}',
        String(new Date().getFullYear()),
    );

    return (
        <footer className="mt-10 border-t border-border px-4 py-4 text-center text-xs text-muted">
            {copyright} ·{' '}
            <Link
                href={`/${locale}/rights`}
                className="underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
                {labels.footerLink}
            </Link>{' '}
            ·{' '}
            <Link
                href={`/${locale}/privacy`}
                className="underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
                {privacyLabel}
            </Link>
        </footer>
    );
}
