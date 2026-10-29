/**
 * Sentry в браузере — ленивая загрузка, только для Client Components.
 *
 * Почему лениво: SDK (~50 KB gzip даже без tracing/replay) в основном бандле
 * утяжелял каждую страницу на ~22%. Здесь `import('@sentry/nextjs')` —
 * отдельный async chunk: грузится после `load`, в простое браузера, не в
 * критическом пути первой отрисовки.
 *
 * Цена: глобальные необработанные ошибки ДО инициализации (первые секунды)
 * не попадут в Sentry. Ошибки error boundary не теряются — `captureBoundaryError`
 * сам догружает SDK. Серверные ошибки — `onRequestError` (instrumentation.ts).
 *
 * НЕ импортировать сюда `@sentry/nextjs` статически и не импортировать
 * `capture-app-error.ts` (серверный, статический SDK) из клиентского кода —
 * иначе SDK вернётся в основной бандл. Типы — только `import type`.
 */

import type { AppErrorArea } from '@/lib/monitoring/capture-app-error';
import { getSentryBaseOptions } from '@/lib/monitoring/sentry-options';

type SentryModule = typeof import('@sentry/nextjs');

let sentryModulePromise: Promise<SentryModule> | null = null;

/** SDK + init один раз; `null`, если DSN не задан (локально). */
function loadBrowserSentry(): Promise<SentryModule> | null {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
        return null;
    }

    sentryModulePromise ??= import('@sentry/nextjs').then((Sentry) => {
        Sentry.init(getSentryBaseOptions());
        return Sentry;
    });

    return sentryModulePromise;
}

/** Из instrumentation-client: инициализация после `load`, в простое. */
export function scheduleBrowserSentry(): void {
    if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_SENTRY_DSN) {
        return;
    }

    const start = () => {
        const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1));
        idle(() => {
            void loadBrowserSentry();
        });
    };

    if (document.readyState === 'complete') {
        start();
    } else {
        window.addEventListener('load', start, { once: true });
    }
}

/**
 * Для error.tsx / global-error.tsx.
 *
 * С `digest` — ошибка сервера: её уже отправил `onRequestError`, в браузер
 * пришла обезличенная копия → не дублируем. Без `digest` — ошибка рендера
 * в браузере: React её поймал boundary, глобальный обработчик SDK не видит.
 */
export function captureBoundaryError(
    error: Error & { digest?: string },
    boundary: 'page' | 'admin' | 'root',
): void {
    if (error.digest) {
        return;
    }

    void loadBrowserSentry()?.then((Sentry) => {
        Sentry.captureException(error, {
            tags: { area: 'error-boundary' satisfies AppErrorArea },
            extra: { boundary },
        });
    });
}

export type BrowserMonitoringCheck =
    | { enabled: false }
    | { enabled: true; eventId: string; delivered: boolean };

/** Тест из админки: событие через туннель `/api/m`, ждём отправку. */
export async function checkBrowserMonitoring(): Promise<BrowserMonitoringCheck> {
    const loading = loadBrowserSentry();

    if (!loading) {
        return { enabled: false };
    }

    const Sentry = await loading;
    const eventId = Sentry.captureException(
        new Error(`Monitoring check (browser) ${new Date().toISOString()}`),
        {
            level: 'warning',
            tags: { area: 'monitoring-check' satisfies AppErrorArea },
        },
    );
    const delivered = await Sentry.flush(2000);

    return { enabled: true, eventId, delivered };
}
