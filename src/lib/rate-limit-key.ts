/**
 * Identity-ключи для rate limit в Server Actions / Route Handlers.
 *
 * Зачем отдельный модуль: `src/lib/rate-limit.ts` остаётся чистым (без Next.js),
 * а здесь читаем request headers — это server-only API (`next/headers`).
 *
 * Правила:
 * - auth (login/register): ключ по IP — атакующий ещё не в сессии;
 * - profile / quiz / upload: предпочтительно `user:<id>` — лимит на аккаунт;
 * - при отсутствии userId можно fallback на IP (не должно быть нормой для protected actions).
 *
 * Не импортировать из Client Components.
 */

import { headers } from 'next/headers';

/**
 * Лучшая доступная оценка IP клиента за прокси (Vercel / Neon path не важен).
 * `x-forwarded-for` может быть списком — берём первый hop (клиент).
 * Если заголовков нет (локальный edge-case) — `unknown` (общий bucket, лучше чем без лимита).
 */
export async function getClientIp(): Promise<string> {
    const headerList = await headers();

    const forwardedFor = headerList.get('x-forwarded-for');
    if (forwardedFor) {
        const first = forwardedFor.split(',')[0]?.trim();
        if (first) {
            return first;
        }
    }

    const realIp = headerList.get('x-real-ip')?.trim();
    if (realIp) {
        return realIp;
    }

    return 'unknown';
}

/** Identity для публичных auth actions: один bucket на IP. */
export async function getIpRateLimitIdentity(): Promise<string> {
    const ip = await getClientIp();
    return `ip:${ip}`;
}

/** Identity для залогиненных действий: один bucket на пользователя. */
export function getUserRateLimitIdentity(userId: string): string {
    return `user:${userId}`;
}
