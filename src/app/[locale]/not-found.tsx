'use client';

/**
 * 404 внутри locale layout (шапка, тема и skip-link остаются).
 *
 * Ловит notFound() из любой страницы под `/:locale/**` и все неизвестные
 * адреса через catch-all `[locale]/[...rest]` (root layout тут — динамический
 * `[locale]`, поэтому стандартный `app/not-found` недоступен; experimental
 * `global-not-found` рендерится без layout — сознательно не используем).
 *
 * Client: not-found не получает params, локаль берём из pathname.
 * Quiz/result по-прежнему не зовут notFound() на transient read (soft-miss,
 * docs/QUIZ_NEON_HOT_PATH.md) — эта страница только для реального 404.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
    defaultLocale,
    getDictionary,
    getLocaleFromPathname,
} from '@/shared/i18n';
import { buttonClassName, StatusPage } from '@/shared/ui';

export default function LocaleNotFound() {
    const pathname = usePathname();
    const locale = getLocaleFromPathname(pathname) ?? defaultLocale;
    const labels = getDictionary(locale).errorPage;

    return (
        <StatusPage
            eyebrow="404"
            title={labels.notFoundTitle}
            description={labels.notFoundDescription}
            actions={
                <>
                    <Link
                        href={`/${locale}/quiz`}
                        className={buttonClassName()}
                    >
                        {labels.toModes}
                    </Link>
                    <Link
                        href={`/${locale}`}
                        className={buttonClassName({ variant: 'secondary' })}
                    >
                        {labels.backHome}
                    </Link>
                </>
            }
        />
    );
}
