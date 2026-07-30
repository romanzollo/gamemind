/**
 * Client island: success toast после admin redirect `?notice=`, затем strip.
 *
 * Copy из dictionary по pathname locale (RU↔EN на открытом toast).
 * RATE_LIMITED / field errors остаются InlineAlert на формах — не дублируем.
 *
 * Strip query откладываем: сразу router.replace на mobile может сорвать
 * первый paint toast (особенно вместе с remount list).
 */
'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { AdminNoticeCode } from '@/features/admin/lib/parse-admin-notice';
import {
    defaultLocale,
    getDictionary,
    getLocaleFromPathname,
} from '@/shared/i18n';
import { toastSuccess } from '@/shared/ui';

type AdminNoticeFlashProps = {
    notice: AdminNoticeCode | null;
};

const firedNoticeKeys = new Set<string>();

const STRIP_DELAY_MS = 120;

function stripNoticeFromUrl(
    pathname: string,
    search: string,
    router: ReturnType<typeof useRouter>,
) {
    const params = new URLSearchParams(search);
    params.delete('notice');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
    });
}

export function AdminNoticeFlash({ notice }: AdminNoticeFlashProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!notice) {
            return;
        }

        const flashKey = `${pathname}?notice=${notice}`;
        const search = searchParams.toString();

        if (firedNoticeKeys.has(flashKey)) {
            stripNoticeFromUrl(pathname, search, router);
            return;
        }
        firedNoticeKeys.add(flashKey);

        const locale = getLocaleFromPathname(pathname) ?? defaultLocale;
        const labels = getDictionary(locale).notifications;
        toastSuccess(labels[notice]);

        const timer = window.setTimeout(() => {
            stripNoticeFromUrl(pathname, search, router);
        }, STRIP_DELAY_MS);

        return () => {
            window.clearTimeout(timer);
        };
    }, [notice, pathname, router, searchParams]);

    return null;
}
