'use client';

/**
 * Последний рубеж: ошибка в самом root layout (`[locale]/layout.tsx` —
 * auth(), cookies(), AppSiteHeader), где `[locale]/error.tsx` уже не помогает.
 *
 * Заменяет root layout целиком, поэтому сам рендерит <html>/<body> и
 * импортирует globals.css (токены + шрифты). Тема — дефолтная light из :root:
 * cookie темы читает упавший layout, здесь на него не полагаемся.
 * Ссылка «на главную» — обычный <a>: полный reload поднимает layout заново.
 */

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import {
    defaultLocale,
    getDictionary,
    getLocaleFromPathname,
} from '@/shared/i18n';
import { Button, buttonClassName, StatusPage } from '@/shared/ui';

import './globals.css';

type GlobalErrorProps = {
    error: Error & { digest?: string };
    unstable_retry: () => void;
};

export default function GlobalError({ error, unstable_retry }: GlobalErrorProps) {
    const pathname = usePathname();
    const locale = getLocaleFromPathname(pathname ?? '') ?? defaultLocale;
    const labels = getDictionary(locale).errorPage;

    useEffect(() => {
        console.error('[root] unhandled error:', error.digest ?? error.message);
    }, [error]);

    return (
        <html lang={locale}>
            <body className="antialiased">
                <title>GameMind</title>
                <StatusPage
                    title={labels.errorTitle}
                    description={labels.errorDescription}
                    actions={
                        <>
                            <Button onClick={() => unstable_retry()}>
                                {labels.retry}
                            </Button>
                            <a
                                href={`/${locale}`}
                                className={buttonClassName({
                                    variant: 'secondary',
                                })}
                            >
                                {labels.backHome}
                            </a>
                        </>
                    }
                    footnote={
                        error.digest
                            ? `${labels.errorReference}: ${error.digest}`
                            : undefined
                    }
                />
            </body>
        </html>
    );
}
