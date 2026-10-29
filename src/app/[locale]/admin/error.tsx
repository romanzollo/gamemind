'use client';

/**
 * Error boundary admin-сегмента (`/:locale/admin/**`).
 *
 * Зачем: admin-страницы читают Neon через Direct pg; необработанный сбой
 * (DirectPgTimeout, «Connection terminated» на cold start) без boundary
 * превращался в дефолтную ошибку Next — redbox в dev, «Application error»
 * на prod, без пути назад. Здесь — понятный текст + повтор + выход на хаб.
 *
 * Это страховка, а не основной путь: ожидаемые сбои чтения страницы
 * обрабатывают сами (InlineAlert + retry, как list и edit).
 * redirect() / notFound() сюда не попадают — Next пропускает их мимо boundary.
 *
 * unstable_retry (Next 16.2) перезапрашивает серверный сегмент;
 * reset только перерисовал бы клиент и снова показал ту же ошибку.
 * Локаль — из pathname: error.tsx не получает params.
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
import { Button, buttonClassName, InlineAlert } from '@/shared/ui';

type AdminErrorProps = {
    error: Error & { digest?: string };
    unstable_retry: () => void;
};

export default function AdminError({ error, unstable_retry }: AdminErrorProps) {
    const pathname = usePathname();
    const locale = getLocaleFromPathname(pathname) ?? defaultLocale;
    const dictionary = getDictionary(locale);

    useEffect(() => {
        // На prod message скрыт Next; digest связывает с Vercel Runtime Logs.
        console.error('[admin] unhandled error:', error.digest ?? error.message);
        captureBoundaryError(error, 'admin');
    }, [error]);

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <InlineAlert>{dictionary.admin.errors.unexpected}</InlineAlert>

            <div className="mt-4 flex flex-wrap gap-2">
                <Button
                    onClick={() => unstable_retry()}
                    className="min-h-10 px-3 text-sm sm:min-h-11"
                >
                    {dictionary.admin.retryLoad}
                </Button>
                <Link
                    href={`/${locale}/admin`}
                    prefetch={false}
                    className={buttonClassName({
                        variant: 'secondary',
                        className: 'min-h-10 px-3 text-sm sm:min-h-11',
                    })}
                >
                    {dictionary.admin.backToAdminHome}
                </Link>
            </div>
        </main>
    );
}
