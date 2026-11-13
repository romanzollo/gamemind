'use client';

/**
 * Считает страницы для воронки (ROADMAP 3.5): первая считаемая страница
 * вкладки — событие `visit` (с источником), дальше — `page_view`.
 * Стоит один раз в layout локали и ничего не рисует.
 *
 * - Страница игры `/quiz/[id]`, админка и незнакомые адреса не считаются
 *   (`toAnalyticsRoute` → null): на горячем пути квиза маячка нет.
 * - Админ (владелец) помечает браузер «не считать» навсегда — его заходы
 *   без входа тоже не попадут в воронку.
 * - Параметры адреса читаем из `window.location` в эффекте, а не через
 *   `useSearchParams`: тот потребовал бы Suspense вокруг всего layout.
 *
 * Canon: docs/DECISIONS.md → Funnel analytics: own events + existing tables.
 */

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import {
    referrerHostOf,
    sanitizeRef,
    toAnalyticsRoute,
} from '@/shared/analytics/events';
import {
    getOrCreateVisitId,
    isAnalyticsOptedOut,
    optOutOfAnalytics,
    track,
} from '@/shared/analytics/track';

/**
 * Последний посчитанный адрес: StrictMode в dev запускает эффект дважды,
 * а повторный рендер того же адреса — не новый просмотр.
 */
let lastCountedPath: string | null = null;

export function AnalyticsPageTracker({ isAdmin }: { isAdmin: boolean }) {
    const pathname = usePathname();

    useEffect(() => {
        if (isAdmin) {
            optOutOfAnalytics();
            return;
        }
        if (isAnalyticsOptedOut() || pathname === lastCountedPath) {
            return;
        }

        const route = toAnalyticsRoute(pathname);
        if (!route) {
            return;
        }
        lastCountedPath = pathname;

        if (getOrCreateVisitId().created) {
            const params = new URLSearchParams(window.location.search);
            track({
                name: 'visit',
                props: {
                    route,
                    referrerHost: referrerHostOf(
                        document.referrer,
                        window.location.hostname,
                    ),
                    ref: sanitizeRef(params.get('ref') ?? params.get('utm_source')),
                },
            });
            return;
        }

        track({ name: 'page_view', props: { route } });
    }, [isAdmin, pathname]);

    return null;
}
