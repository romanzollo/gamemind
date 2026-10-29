/**
 * Next.js instrumentation — side-effects при старте серверного runtime.
 *
 * Здесь инициализируется Sentry для Node и edge, а `onRequestError` отдаёт
 * в Sentry необработанные ошибки рендера, Server Actions, route handlers
 * и proxy. Опции и политика (только ошибки, без PII) — sentry-options.ts.
 *
 * Раньше здесь был периодический warmAdminListConnection (каждые 4 мин).
 * Он шёл через ту же Direct-очередь, что quiz start/pick. На больном Neon
 * зависший ping на 12–50с блокировал Classic/Blitz и выглядел как «всё встало».
 * Warm с admin hub (явный ping) остаётся; фоновый interval не возвращать.
 * См. DECISIONS.md → Quiz Start Playbook: не занимать Direct queue warm’ом.
 */

import * as Sentry from '@sentry/nextjs';

import { getSentryBaseOptions } from '@/lib/monitoring/sentry-options';

export async function register() {
    if (
        process.env.NEXT_RUNTIME === 'nodejs' ||
        process.env.NEXT_RUNTIME === 'edge'
    ) {
        Sentry.init(getSentryBaseOptions());
    }
}

export const onRequestError = Sentry.captureRequestError;
