import { beforeEach, describe, expect, it, vi } from 'vitest';

// Модуль тянет Prisma, Sentry и `after` — в unit-тестах ядра они не нужны.
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/monitoring/capture-app-error', () => ({
    captureAppError: vi.fn(),
}));
vi.mock('next/server', () => ({ after: vi.fn() }));

import { __resetRateLimitStoreForTests } from '@/lib/rate-limit';
import {
    consumeSharedRateLimit,
    type RateLimitBucketStore,
} from '@/lib/rate-limit-shared';

/** Та же семантика окна, что у SQL upsert в prismaRateLimitStore. */
function createFakeStore(): RateLimitBucketStore {
    const rows = new Map<string, { count: number; resetAtMs: number }>();

    return {
        async consume({ key, now, resetAt }) {
            const row = rows.get(key);
            const next =
                !row || row.resetAtMs <= now.getTime()
                    ? { count: 1, resetAtMs: resetAt.getTime() }
                    : { count: row.count + 1, resetAtMs: row.resetAtMs };
            rows.set(key, next);
            return next;
        },
    };
}

const failingStore: RateLimitBucketStore = {
    consume: () => Promise.reject(new Error('Connection terminated')),
};

const hangingStore: RateLimitBucketStore = {
    consume: () => new Promise(() => undefined),
};

describe('consumeSharedRateLimit', () => {
    beforeEach(() => {
        __resetRateLimitStoreForTests();
    });

    it('блокирует сверх лимита, даже если память инстанса сброшена', async () => {
        const store = createFakeStore();
        const base = { key: 'auth:ip:1', limit: 3, windowMs: 60_000, store };

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            // Каждая попытка — «другой инстанс»: in-memory Map пустая.
            __resetRateLimitStoreForTests();
            const result = await consumeSharedRateLimit({ ...base, now: 1_000 });
            expect(result).toMatchObject({ ok: true, remaining: 3 - attempt });
        }

        __resetRateLimitStoreForTests();
        const blocked = await consumeSharedRateLimit({ ...base, now: 2_000 });
        expect(blocked).toEqual({
            ok: false,
            remaining: 0,
            resetAt: 61_000,
            retryAfterMs: 59_000,
        });
    });

    it('открывает новое окно после resetAt', async () => {
        const store = createFakeStore();
        const base = { key: 'password:user:u1', limit: 1, windowMs: 1_000, store };

        await consumeSharedRateLimit({ ...base, now: 0 });
        expect((await consumeSharedRateLimit({ ...base, now: 500 })).ok).toBe(
            false,
        );

        const reopened = await consumeSharedRateLimit({ ...base, now: 1_000 });
        expect(reopened).toEqual({ ok: true, remaining: 0, resetAt: 2_000 });
    });

    it('при ошибке базы считает в памяти и сообщает об ошибке', async () => {
        const onStoreError = vi.fn();
        const base = {
            key: 'auth:ip:2',
            limit: 1,
            windowMs: 60_000,
            store: failingStore,
            onStoreError,
        };

        expect((await consumeSharedRateLimit({ ...base, now: 0 })).ok).toBe(true);
        expect((await consumeSharedRateLimit({ ...base, now: 10 })).ok).toBe(
            false,
        );
        expect(onStoreError).toHaveBeenCalledTimes(2);
    });

    it('не ждёт зависшую базу дольше бюджета', async () => {
        const onStoreError = vi.fn();

        const result = await consumeSharedRateLimit({
            key: 'avatar:user:u2',
            limit: 5,
            windowMs: 60_000,
            store: hangingStore,
            now: 0,
            timeoutMs: 20,
            onStoreError,
        });

        expect(result).toMatchObject({ ok: true, remaining: 4 });
        expect(onStoreError).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'RateLimitStoreTimeoutError' }),
        );
    });
});
