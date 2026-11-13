/**
 * Маячок воронки (ROADMAP 3.5): браузер шлёт пачку событий до игры —
 * визит, страница, шторка режима, «Поделиться».
 *
 * POST `{ v: visitId, e: [{ n, p }] }` через `navigator.sendBeacon`. Ответ
 * всегда пустой (204 / код ошибки без тела): маячку ответ не нужен, а
 * спамеру незачем знать, что принято.
 *
 * Порядок дешёвых отказов до любой работы: бот по UA → лимит по IP (в
 * памяти, без hop в БД) → размер тела → схема. Затем `auth()` — только
 * разбор JWT из cookie, без запроса в БД. Запись — в `after()`, когда ответ
 * уже ушёл: один pooled INSERT, сбой — предупреждение в Sentry без IP.
 *
 * Не горячий путь квиза: на странице игры маячка нет, старт и сдача сюда
 * не ходят. Под `/api` — proxy.ts (локаль, редиректы входа) его не трогает.
 * Имя `/e` нейтральное, как `/api/m` у Sentry: реже в списках блокировщиков.
 *
 * Canon: docs/DECISIONS.md → Funnel analytics: own events + existing tables.
 */

import { after } from 'next/server';

import {
    ANALYTICS_MAX_BODY_BYTES,
    countryOf,
    deviceClassOf,
    isBotUserAgent,
    parseBeaconBody,
    toEventRows,
} from '@/entities/analytics-event/analytics-event-input';
import { analyticsEventRepository } from '@/entities/analytics-event/analytics-event.repository';
import { auth } from '@/lib/auth';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { checkPresetRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Доля маячков, после которых чистим старые события (как у RateLimitBucket). */
const PRUNE_PROBABILITY = 0.02;

function empty(status: number): Response {
    return new Response(null, {
        status,
        headers: { 'Cache-Control': 'no-store' },
    });
}

/** Первый hop `x-forwarded-for` — клиент; IP нужен только ключу лимита. */
function clientIpOf(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export async function POST(request: Request): Promise<Response> {
    const userAgent = request.headers.get('user-agent');
    if (isBotUserAgent(userAgent)) {
        return empty(204);
    }

    const rate = checkPresetRateLimit('analytics', `ip:${clientIpOf(request)}`);
    if (!rate.ok) {
        return empty(429);
    }

    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > ANALYTICS_MAX_BODY_BYTES) {
        return empty(413);
    }

    const text = await request.text().catch(() => '');
    if (!text || text.length > ANALYTICS_MAX_BODY_BYTES) {
        return empty(text ? 413 : 400);
    }

    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return empty(400);
    }

    const beacon = parseBeaconBody(raw);
    if (!beacon) {
        return empty(400);
    }
    if (beacon.events.length === 0) {
        return empty(204);
    }

    const session = await auth();
    // Админ (владелец) не считается: его игры и клики исказили бы воронку,
    // где игроков единицы. Тестовые аккаунты отсекает отчёт по User.
    if (session?.user?.role === 'ADMIN') {
        return empty(204);
    }

    const rows = toEventRows({
        beacon,
        userId: session?.user?.id ?? null,
        device: deviceClassOf(userAgent),
        country: countryOf(request.headers.get('x-vercel-ip-country')),
    });

    after(async () => {
        try {
            await analyticsEventRepository.insertMany(rows);
        } catch (error) {
            captureAppError(error, {
                area: 'analytics',
                level: 'warning',
                extra: { events: rows.length },
            });
            return;
        }

        if (Math.random() < PRUNE_PROBABILITY) {
            await analyticsEventRepository.pruneExpired().catch(() => {
                // best-effort: следующая уборка подберёт хвост
            });
        }
    });

    return empty(204);
}
