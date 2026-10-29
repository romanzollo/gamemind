/**
 * Общий rate limit (один счётчик на все инстансы Vercel) для чувствительных
 * Server Actions: вход/регистрация, смена пароля, аватар, запись в админке.
 *
 * Зачем: in-memory лимитер (`rate-limit.ts`) живёт в памяти одного инстанса —
 * перебор пароля с одного IP получал «10 попыток × число инстансов». Здесь
 * счётчик в Postgres (`RateLimitBucket`): один атомарный upsert на проверку
 * через Prisma-пул, который эти actions всё равно открывают следующим шагом.
 *
 * Границы:
 * - `quiz` сюда не входит намеренно (тип не даст): его проверяют старт и
 *   сдача квиза, а на критическом пути сдачи лишний hop к Neon запрещён
 *   (docs/QUIZ_NEON_HOT_PATH.md). Квиз остаётся на in-memory лимитере.
 * - Сбой или медленная база не ломают действие: fallback на in-memory
 *   счётчик + warning в Sentry. Защита деградирует до прежней, но не падает.
 * - Время окна — из JS (`Date.now()`), не SQL `NOW()`: одна логика с
 *   in-memory версией и детерминированные тесты.
 * - Только серверный код. Не импортировать из Client Components.
 *
 * Canon: docs/DECISIONS.md → Shared rate limit and favicon.ico.
 */

import { after } from 'next/server';

import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { prisma } from '@/lib/prisma';
import {
    checkRateLimit,
    RATE_LIMIT_PRESETS,
    type RateLimitPresetName,
    type RateLimitResult,
} from '@/lib/rate-limit';

/** Пресеты с общим счётчиком. `quiz` — только in-memory (горячий путь). */
export type SharedRateLimitPresetName = Exclude<RateLimitPresetName, 'quiz'>;

/** Хранилище окна: атомарно +1 (или новое окно) и вернуть состояние. */
export type RateLimitBucketStore = {
    consume(input: {
        key: string;
        now: Date;
        resetAt: Date;
    }): Promise<{ count: number; resetAtMs: number }>;
};

/**
 * Бюджет на hop к базе. На проде upsert — единицы мс (fra1 ↔ Neon Frankfurt);
 * 4 с покрывают пробуждение Neon. Дольше — пользователь ждёт вход ради
 * счётчика; лучше fallback.
 */
const STORE_TIMEOUT_MS = 4_000;

/** Доля проверок, после которых чистим просроченные окна (через `after`). */
const PRUNE_PROBABILITY = 0.02;

class RateLimitStoreTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Rate limit store timed out after ${timeoutMs}ms`);
        this.name = 'RateLimitStoreTimeoutError';
    }
}

async function withStoreTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            promise,
            new Promise<T>((_resolve, reject) => {
                timeoutId = setTimeout(
                    () => reject(new RateLimitStoreTimeoutError(timeoutMs)),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    }
}

/**
 * Ядро: одна проверка через store, при сбое — in-memory с тем же ключом.
 * Store и время инжектятся ради тестов; в фичах — `checkSharedPresetRateLimit`.
 */
export async function consumeSharedRateLimit(options: {
    key: string;
    limit: number;
    windowMs: number;
    store: RateLimitBucketStore;
    now?: number;
    timeoutMs?: number;
    onStoreError?: (error: unknown) => void;
}): Promise<RateLimitResult> {
    const now = options.now ?? Date.now();
    const { key, limit, windowMs, store } = options;

    try {
        const { count, resetAtMs } = await withStoreTimeout(
            store.consume({
                key,
                now: new Date(now),
                resetAt: new Date(now + windowMs),
            }),
            options.timeoutMs ?? STORE_TIMEOUT_MS,
        );

        if (count > limit) {
            return {
                ok: false,
                remaining: 0,
                resetAt: resetAtMs,
                retryAfterMs: Math.max(0, resetAtMs - now),
            };
        }

        return { ok: true, remaining: limit - count, resetAt: resetAtMs };
    } catch (error) {
        options.onStoreError?.(error);
        return checkRateLimit({ key, limit, windowMs, now });
    }
}

/**
 * Один SQL на проверку. В ON CONFLICT оба CASE видят СТАРУЮ строку
 * (семантика Postgres), поэтому сброс count и продление resetAt согласованы.
 * Сверх лимита count продолжает расти, окно не продлевается — блок длится
 * ровно до resetAt, как в in-memory версии.
 */
const prismaRateLimitStore: RateLimitBucketStore = {
    async consume({ key, now, resetAt }) {
        const nowIso = now.toISOString();
        const rows = await prisma.$queryRaw<
            { count: number; resetAtMs: number }[]
        >`
            INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
            VALUES (${key}, 1, ${resetAt.toISOString()}::timestamptz)
            ON CONFLICT ("key") DO UPDATE SET
                "count" = CASE
                    WHEN "RateLimitBucket"."resetAt" <= ${nowIso}::timestamptz THEN 1
                    ELSE "RateLimitBucket"."count" + 1
                END,
                "resetAt" = CASE
                    WHEN "RateLimitBucket"."resetAt" <= ${nowIso}::timestamptz
                        THEN EXCLUDED."resetAt"
                    ELSE "RateLimitBucket"."resetAt"
                END
            RETURNING
                "count",
                (EXTRACT(EPOCH FROM "resetAt") * 1000)::float8 AS "resetAtMs"
        `;

        const row = rows[0];
        if (!row) {
            throw new Error('Rate limit upsert returned no row');
        }

        return { count: row.count, resetAtMs: row.resetAtMs };
    },
};

/**
 * Удаляет истёкшие окна. Редко и после ответа (`after`): таблица маленькая,
 * а IP в ключах не должны лежать дольше, чем нужно лимиту.
 */
function schedulePruneExpiredBuckets(now: number): void {
    if (Math.random() >= PRUNE_PROBABILITY) {
        return;
    }

    after(async () => {
        try {
            await prisma.$executeRaw`
                DELETE FROM "RateLimitBucket"
                WHERE "resetAt" <= ${new Date(now).toISOString()}::timestamptz
            `;
        } catch {
            // best-effort: следующая уборка подберёт хвост
        }
    });
}

/** Вызов из Server Action: `await checkSharedPresetRateLimit('auth', identity)`. */
export async function checkSharedPresetRateLimit(
    preset: SharedRateLimitPresetName,
    identityKey: string,
): Promise<RateLimitResult> {
    const { limit, windowMs } = RATE_LIMIT_PRESETS[preset];
    const now = Date.now();

    const result = await consumeSharedRateLimit({
        key: `${preset}:${identityKey}`,
        limit,
        windowMs,
        now,
        store: prismaRateLimitStore,
        onStoreError: (error) => {
            // Без identity в extra: там IP или userId.
            captureAppError(error, {
                area: 'rate-limit',
                level: 'warning',
                extra: { preset },
            });
        },
    });

    schedulePruneExpiredBuckets(now);
    return result;
}
