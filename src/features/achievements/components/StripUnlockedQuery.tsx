/**
 * Убирает `?unlocked=` из адреса профиля после первого показа вспышки.
 *
 * Зачем: refresh и пересланная ссылка не должны повторять «Новое».
 * `history.replaceState`, а не `router.replace`: router перезапросил бы
 * Server Component без query, и подсветка пропала бы сразу после paint.
 * Next (App Router) синхронизирует нативный replaceState со своим роутером.
 *
 * Только UI; в БД не пишет.
 */
'use client';

import { useEffect } from 'react';

export function StripUnlockedQuery() {
    useEffect(() => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('unlocked')) {
            return;
        }
        url.searchParams.delete('unlocked');
        window.history.replaceState(
            window.history.state,
            '',
            `${url.pathname}${url.search}${url.hash}`,
        );
    }, []);

    return null;
}
