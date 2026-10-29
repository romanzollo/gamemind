/**
 * Отправка в Sentry ошибок, которые приложение ПЕРЕХВАТИЛО само.
 *
 * Необработанные ошибки Sentry ловит сам (`onRequestError`, глобальные
 * обработчики браузера). Но soft-fail места (сдача квиза → SUBMIT_FAILED,
 * upload → UPLOAD_FAILED, InlineAlert + retry в админке) гасят исключение —
 * без явного вызова о них знают только логи. Здесь — единая точка, чтобы
 * фичи не зависели от SDK напрямую (смена вендора = правка одного файла).
 *
 * Только серверный код (actions, route handlers, Server Components): SDK
 * здесь подключён статически. В Client Components — `sentry-browser.ts`
 * (ленивая загрузка), иначе SDK попадёт в основной клиентский бандл.
 * Без DSN — no-op. Отправка на Vercel дожидается конца запроса сама
 * (waitUntil в SDK), flush вручную не нужен.
 * Не класть в `extra` PII (email, имя, ввод игрока) — только id и коды.
 */

import * as Sentry from '@sentry/nextjs';

/** Зона продукта: тег для фильтров и алертов в Sentry. */
export type AppErrorArea =
    | 'quiz-start'
    | 'quiz-submit'
    | 'quiz-result'
    | 'media-upload'
    | 'admin-question'
    | 'achievements'
    | 'auth'
    | 'error-boundary'
    | 'monitoring-check';

type CaptureAppErrorContext = {
    area: AppErrorArea;
    /**
     * `warning` — ожидаемый сбой с обходом (retry, soft-miss, Neon-флейк);
     * `error` — пользователь потерял действие или это баг.
     */
    level?: 'error' | 'warning';
    extra?: Record<string, string | number | boolean | null | undefined>;
};

/** Возвращает id события Sentry (пустая строка-заглушка, если SDK выключен). */
export function captureAppError(
    error: unknown,
    { area, level = 'error', extra }: CaptureAppErrorContext,
): string {
    return Sentry.captureException(error, {
        level,
        tags: { area },
        extra,
    });
}

/** true, если SDK инициализирован с DSN (на проде), false — локально. */
export function isMonitoringEnabled(): boolean {
    return Sentry.isEnabled();
}

/** Дождаться отправки (проверка мониторинга; в обычном коде не нужно). */
export function flushMonitoring(timeoutMs = 2000): Promise<boolean> {
    return Sentry.flush(timeoutMs);
}
