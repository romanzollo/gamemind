'use client';

/**
 * Error boundary всех страниц под `/:locale/**` (кроме самого locale layout —
 * его ловит `app/global-error.tsx`; admin-сегмент — свой `admin/error.tsx`).
 *
 * Страховка, а не основной путь: ожидаемые сбои Neon страницы обрабатывают
 * сами (soft-miss / InlineAlert + retry). redirect() / notFound() Next
 * пропускает мимо boundary.
 *
 * unstable_retry (Next 16.2) перезапрашивает серверный сегмент;
 * reset только перерисовал бы клиент с той же ошибкой.
 * digest показываем игроку: на prod message скрыт, а по digest запись
 * находится в Vercel Runtime Logs.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { captureBoundaryError } from '@/lib/monitoring/sentry-browser';
import {
    defaultLocale,
    getDictionary,
    getLocaleFromPathname,
} from '@/shared/i18n';
import { Button, buttonClassName, StatusPage } from '@/shared/ui';

type LocaleErrorProps = {
    error: Error & { digest?: string };
    unstable_retry: () => void;
};

export default function LocaleError({ error, unstable_retry }: LocaleErrorProps) {
    const pathname = usePathname();
    const locale = getLocaleFromPathname(pathname) ?? defaultLocale;
    const labels = getDictionary(locale).errorPage;

    useEffect(() => {
        console.error('[page] unhandled error:', error.digest ?? error.message);
        captureBoundaryError(error, 'page');
    }, [error]);

    return (
        <StatusPage
            title={labels.errorTitle}
            description={labels.errorDescription}
            actions={
                <>
                    <Button onClick={() => unstable_retry()}>
                        {labels.retry}
                    </Button>
                    <Link
                        href={`/${locale}`}
                        className={buttonClassName({ variant: 'secondary' })}
                    >
                        {labels.backHome}
                    </Link>
                </>
            }
            footnote={
                error.digest
                    ? `${labels.errorReference}: ${error.digest}`
                    : undefined
            }
        />
    );
}
