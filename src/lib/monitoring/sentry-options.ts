/**
 * Общие опции Sentry для браузера, Node и edge.
 *
 * Политика (ADR: DECISIONS → Error monitoring: Sentry EU):
 * - только ошибки: без `tracesSampleRate` SDK не подключает tracing-
 *   интеграции (в т.ч. обёртку `pg`) — горячий путь квиза с Neon не трогаем;
 * - без PII: ни IP, ни cookie, ни email (данные уходят за рубеж, 152-ФЗ);
 * - без DSN SDK выключен целиком: локально `NEXT_PUBLIC_SENTRY_DSN` не задан,
 *   dev-ошибки не тратят квоту. DSN не секрет — он и так виден в браузере.
 *
 * Модуль без серверных зависимостей: его импортирует и instrumentation-client.
 */

/** `production` / `preview` на Vercel, `local` — сборка на своей машине. */
function getSentryEnvironment(): string {
    return process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'local';
}

export function getSentryBaseOptions() {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

    return {
        dsn,
        enabled: Boolean(dsn),
        environment: getSentryEnvironment(),
        sendDefaultPii: false,
    };
}
