/**
 * Sentry в браузере: ленивая инициализация после загрузки страницы.
 *
 * SDK не в основном бандле (см. `sentry-browser.ts`): грузится отдельным
 * chunk'ом после `load`, в простое. События идут не на sentry.io, а в
 * туннель `/api/m` на нашем домене (`tunnelRoute` в next.config.ts) —
 * доходят из РФ и мимо блокировщиков.
 *
 * `onRouterTransitionStart` не экспортируем: он нужен только для tracing
 * навигации, а tracing выключен и вырезан из бандла (`excludeTracing`).
 */

import { scheduleBrowserSentry } from '@/lib/monitoring/sentry-browser';

scheduleBrowserSentry();
