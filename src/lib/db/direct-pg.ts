/**
 * Direct pg helpers for Neon.
 *
 * Critical rules:
 * - Never await client.end() on the response path (Neon close can take ~19s).
 * - Success path: fire-and-forget `client.end()` ONLY — do not `stream.destroy()`.
 *   Abrupt destroy after a healthy write was observed to leave the next hop in
 *   «connect OK, query hangs until wall timeout» (submit → result soft-fail).
 * - On wall-clock timeout / hard error: mark aborted SYNCHRONOUSLY and destroy
 *   the socket so a late connect cannot start a query on a half-dead client.
 * - Prefer unpooled URL for admin/quiz reads and quiz start; pooled+tight
 *   timeout was a known false-failure regression on Windows `next dev`.
 * - In development on Windows, soften SSL and serialize Direct (unpooled)
 *   connect hops: parallel / back-to-back fresh-Client TLS wedges `next dev`
 *   (submit → result review, cold Timed start). Same pattern as admin-list queue.
 * - Quiz submit/result JSONB rules: docs/QUIZ_NEON_HOT_PATH.md (do not put large
 *   JSONB/TOAST on complete critical path — shared queue wedges the whole app).
 */
import { Client } from 'pg';

const TRANSIENT_DIRECT_PG_ERROR_MESSAGES = [
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection ended unexpectedly',
    'not queryable',
    'Query read timeout',
    'canceling statement due to statement timeout',
    'ECONNRESET',
    'ETIMEDOUT',
    'timeout expired',
    'timeout exceeded when trying to connect',
    'Direct pg operation timed out',
];

const DEPRECATED_SSL_MODES = new Set(['prefer', 'require', 'verify-ca']);

/**
 * Wall-clock budget per read attempt.
 * Smoke outside Next.js: connect ~0.3–1.1s, admin list query ~50–150ms.
 * 12s×2 ловил ложный DB_TIMEOUT на Classic 10Q в Windows `next dev` при
 * живых 3/5 (connect ~8–10s + resolve 10Q). 18s×2 покрывает cold Neon wake
 * без отката к 30s×2 (=60s боли). Не поднимать дальше без нового измерения.
 */
const READ_ATTEMPT_TIMEOUT_MS = 18_000;
const READ_MAX_ATTEMPTS = 2;

const isDev = process.env.NODE_ENV === 'development';

/**
 * Normalize Neon connection strings for node-pg.
 *
 * Production: upgrade weak sslmode → verify-full.
 * Development (Windows): strip sslmode — node-pg treats `require` as
 * verify-full and that combination often wedges TLS inside `next dev`.
 */
export function normalizePgConnectionString(connectionString: string) {
    try {
        const url = new URL(connectionString);

        if (isDev) {
            url.searchParams.delete('sslmode');
            return url.toString();
        }

        const sslmode = url.searchParams.get('sslmode');

        if (!sslmode || DEPRECATED_SSL_MODES.has(sslmode)) {
            url.searchParams.set('sslmode', 'verify-full');
        }

        return url.toString();
    } catch {
        return connectionString;
    }
}

function getDirectDatabaseUrl() {
    const connectionString =
        process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
    }

    return normalizePgConnectionString(connectionString);
}

function getPooledDatabaseUrl() {
    const connectionString =
        process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;

    if (!connectionString) {
        throw new Error('DATABASE_URL or DATABASE_URL_UNPOOLED is required');
    }

    return normalizePgConnectionString(connectionString);
}

function createClient(connectionString: string) {
    // `family: 4` forces IPv4 — helps Windows + Neon dual-stack TLS hangs.
    // Not in @types/pg ClientConfig, but node-pg forwards it to net.connect.
    // Dev: rejectUnauthorized false — matches working minimal Next smoke on Windows.
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: !isDev },
        keepAlive: true,
        connectionTimeoutMillis: 10_000,
        family: 4,
    } as ConstructorParameters<typeof Client>[0]);

    client.on('error', (error) => {
        if (isDev) {
            console.warn('Direct pg client error:', error.message);
        }
    });

    return client;
}

function createDirectClient() {
    return createClient(getDirectDatabaseUrl());
}

function createPooledClient() {
    return createClient(getPooledDatabaseUrl());
}

export function isTransientDirectPgError(error: unknown) {
    return (
        error instanceof Error &&
        TRANSIENT_DIRECT_PG_ERROR_MESSAGES.some((message) =>
            error.message.includes(message),
        )
    );
}

export class DirectPgTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Direct pg operation timed out after ${timeoutMs}ms`);
        this.name = 'DirectPgTimeoutError';
    }
}

/** name-check: instanceof может ломаться при HMR / дублях бандла. */
export function isDirectPgTimeoutError(error: unknown): boolean {
    return (
        error instanceof DirectPgTimeoutError ||
        (error instanceof Error && error.name === 'DirectPgTimeoutError')
    );
}

function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type TimeoutControl = {
    /** Called synchronously when the wall-clock budget expires. */
    onTimeout?: () => void;
};

type DirectPgOperationOptions = {
    /**
     * Имя критичного Direct-hop для dev-диагностики очереди и TLS.
     * Не передавать для обычных экранов: лог нужен только при расследовании.
     */
    debugLabel?: string;
    /**
     * Переопределение wall-clock на попытку.
     * Для post-submit review JSONB: короче дефолта — не держать очередь 18s×2.
     */
    attemptTimeoutMs?: number;
    /** По умолчанию READ_MAX_ATTEMPTS (2). Review: 1. */
    maxAttempts?: number;
};

async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    control?: TimeoutControl,
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            promise,
            new Promise<T>((_resolve, reject) => {
                timeoutId = setTimeout(() => {
                    control?.onTimeout?.();
                    reject(new DirectPgTimeoutError(timeoutMs));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    }
}

/** Abort path only: kill the socket so a wedged TLS cannot linger ~19s. */
function destroyClient(client: Client) {
    try {
        const maybeConnection = (
            client as unknown as {
                connection?: { stream?: { destroy?: () => void } };
            }
        ).connection;
        maybeConnection?.stream?.destroy?.();
    } catch {
        // ignore — best-effort
    }

    void client.end().catch(() => undefined);
}

/**
 * Success path teardown: graceful end without socket.destroy.
 * Destroy после здорового hop клинит следующий query на Windows+Neon
 * (connect проходит, operation висит до READ_ATTEMPT_TIMEOUT).
 */
function releaseClient(client: Client) {
    void client.end().catch(() => undefined);
}

async function withFreshClient<T>(
    createClientFn: () => Client,
    operation: (client: Client) => Promise<T>,
    options?: {
        attemptTimeoutMs?: number;
        debugLabel?: string;
        queueWaitMs?: number;
        attempt?: number;
    },
): Promise<T> {
    const client = createClientFn();
    let aborted = false;
    const startedAt = performance.now();
    let connectStartedAt: number | null = null;
    let connectedAt: number | null = null;
    let operationStartedAt: number | null = null;
    let finishedAt: number | null = null;

    const abort = () => {
        aborted = true;
        destroyClient(client);
    };

    try {
        const run = async () => {
            connectStartedAt = performance.now();
            await client.connect();
            connectedAt = performance.now();

            if (aborted) {
                throw new DirectPgTimeoutError(
                    options?.attemptTimeoutMs ?? READ_ATTEMPT_TIMEOUT_MS,
                );
            }

            operationStartedAt = performance.now();
            const result = await operation(client);
            finishedAt = performance.now();
            return result;
        };

        if (options?.attemptTimeoutMs !== undefined) {
            const result = await withTimeout(run(), options.attemptTimeoutMs, {
                onTimeout: abort,
            });

            if (aborted) {
                throw new DirectPgTimeoutError(options.attemptTimeoutMs);
            }

            return result;
        }

        const result = await run();

        if (aborted) {
            throw new DirectPgTimeoutError(READ_ATTEMPT_TIMEOUT_MS);
        }

        return result;
    } catch (error) {
        abort();
        throw error;
    } finally {
        if (isDev && options?.debugLabel) {
            const endedAt = finishedAt ?? performance.now();
            const connectMs =
                connectStartedAt == null || connectedAt == null
                    ? null
                    : Math.round(connectedAt - connectStartedAt);
            const operationMs =
                operationStartedAt == null
                    ? null
                    : Math.round(endedAt - operationStartedAt);
            const phase =
                connectedAt == null
                    ? 'connect'
                    : operationStartedAt == null || finishedAt == null
                      ? 'operation'
                      : 'ok';

            console.info(
                `Direct pg hop ${options.debugLabel} attempt ${options.attempt ?? 1}: ` +
                    `queue=${Math.round(options.queueWaitMs ?? 0)}ms ` +
                    `waiters=${getDirectPgQueueWaiterCount()} ` +
                    `connect=${connectMs ?? 'timeout'}ms ` +
                    `operation=${operationMs ?? 'not-started'}ms ` +
                    `total=${Math.round(endedAt - startedAt)}ms phase=${phase}`,
            );
        }

        // Success: graceful end. Abort/error: destroy already ran in abort().
        if (!aborted) {
            releaseClient(client);
        }
    }
}

async function withPgReadRetry<T>(
    operation: (attempt: number) => Promise<T>,
    attempts = READ_MAX_ATTEMPTS,
) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation(attempt);
        } catch (error) {
            lastError = error;

            if (!isTransientDirectPgError(error) || attempt === attempts) {
                throw error;
            }

            if (isDev) {
                console.warn(
                    `Direct pg read retry ${attempt}/${attempts}:`,
                    error instanceof Error ? error.message : error,
                );
            }

            // Brief pause so a wedged TLS attempt can finish tearing down.
            await wait(400 * attempt);
        }
    }

    throw lastError;
}

const readClientOptions = {
    attemptTimeoutMs: READ_ATTEMPT_TIMEOUT_MS,
} as const;

/**
 * Очередь unpooled Direct-клиентов в `next dev` (Windows+Neon).
 * После submit/result/admin нельзя сразу открывать второй TLS — socket.destroy
 * предыдущего ещё не осел. Prod (Linux/serverless) обычно ок без очереди.
 */
const globalForDirectPg = globalThis as typeof globalThis & {
    __directPgTail?: Promise<unknown>;
    __directPgWaiters?: number;
};

const DIRECT_PG_SETTLE_MS = 300;

async function withDirectPgQueue<T>(
    run: (queueWaitMs: number) => Promise<T>,
): Promise<T> {
    if (!isDev) {
        return run(0);
    }

    globalForDirectPg.__directPgWaiters =
        (globalForDirectPg.__directPgWaiters ?? 0) + 1;

    const previous = globalForDirectPg.__directPgTail ?? Promise.resolve();
    let releaseTail!: () => void;
    const tail = new Promise<void>((resolve) => {
        releaseTail = resolve;
    });
    globalForDirectPg.__directPgTail = previous.then(
        () => tail,
        () => tail,
    );

    const queueStartedAt = performance.now();
    await previous.catch(() => undefined);
    const queueWaitMs = performance.now() - queueStartedAt;

    try {
        return await run(queueWaitMs);
    } finally {
        globalForDirectPg.__directPgWaiters = Math.max(
            0,
            (globalForDirectPg.__directPgWaiters ?? 1) - 1,
        );
        await wait(DIRECT_PG_SETTLE_MS);
        releaseTail();
    }
}

/** Dev-only: сколько Direct-hop сейчас ждут/держат общую очередь. */
export function getDirectPgQueueWaiterCount() {
    return globalForDirectPg.__directPgWaiters ?? 0;
}

/**
 * Reads via unpooled Neon host. Prefer for admin list/detail and critical
 * quiz reads.
 */
export async function withDirectPgClient<T>(
    operation: (client: Client) => Promise<T>,
    options?: DirectPgOperationOptions,
) {
    const attemptTimeoutMs =
        options?.attemptTimeoutMs ?? readClientOptions.attemptTimeoutMs;
    const maxAttempts = options?.maxAttempts ?? READ_MAX_ATTEMPTS;

    return withDirectPgQueue((queueWaitMs) =>
        withPgReadRetry(
            (attempt) =>
                withFreshClient(createDirectClient, operation, {
                    attemptTimeoutMs,
                    debugLabel: options?.debugLabel,
                    queueWaitMs,
                    attempt,
                }),
            maxAttempts,
        ),
    );
}

/**
 * Optional pooled reads for simple SELECTs. Prefer `withDirectPgClient` when
 * the same Next.js process already shows unpooled (quiz) healthy and pooled
 * admin reads timing out.
 */
export async function withPooledPgReadClient<T>(
    operation: (client: Client) => Promise<T>,
) {
    return withPgReadRetry(() =>
        withFreshClient(createPooledClient, operation, readClientOptions),
    );
}

/**
 * Короткий scalar hop вне shared Direct queue (UserQuestionCycle на quiz start).
 *
 * Почему pooled + вне queue: cycle на `withDirectPg*` клинил start/home/submit
 * (история A); Prisma pooled давал ложный «Connection terminated» после COMMIT.
 * Fresh `pg` Client на DATABASE_URL + fire-and-forget end — без очереди и без
 * автоматического write-retry (optimistic lock остаётся у caller).
 */
export async function withPooledPgClient<T>(
    operation: (client: Client) => Promise<T>,
    options?: Pick<DirectPgOperationOptions, 'debugLabel' | 'attemptTimeoutMs'>,
) {
    return withFreshClient(createPooledClient, operation, {
        debugLabel: options?.debugLabel,
        attemptTimeoutMs: options?.attemptTimeoutMs,
    });
}

/**
 * Writes: fresh direct client without automatic retry.
 * Таймаут только если caller передал `attemptTimeoutMs` (например award catch-up) —
 * quiz submit write path по умолчанию без лимита, как раньше.
 */
export async function withDirectPgWriteClient<T>(
    operation: (client: Client) => Promise<T>,
    options?: DirectPgOperationOptions,
) {
    return withDirectPgQueue((queueWaitMs) =>
        withFreshClient(createDirectClient, operation, {
            debugLabel: options?.debugLabel,
            queueWaitMs,
            attemptTimeoutMs: options?.attemptTimeoutMs,
        }),
    );
}

/** Writes with one guarded retry for transient Neon connect/socket errors. */
export async function withDirectPgWriteRetry<T>(
    operation: (client: Client) => Promise<T>,
    attempts = 2,
) {
    return withDirectPgQueue(async () => {
        let lastError: unknown;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                return await withFreshClient(createDirectClient, operation);
            } catch (error) {
                lastError = error;

                if (!isTransientDirectPgError(error) || attempt === attempts) {
                    throw error;
                }

                await wait(300 * attempt);
            }
        }

        throw lastError;
    });
}

/**
 * Best-effort wake Neon unpooled host.
 * Не вызывать fire-and-forget на quiz lobby: занимает Direct-очередь и
 * может клинить следующий start. Оставлен для явного/редкого ping.
 */
const WARM_ATTEMPT_TIMEOUT_MS = 5_000;

export async function warmDirectPgConnection(): Promise<void> {
    try {
        await withDirectPgQueue(() =>
            withFreshClient(
                createDirectClient,
                (client) => client.query('SELECT 1'),
                { attemptTimeoutMs: WARM_ATTEMPT_TIMEOUT_MS },
            ),
        );
    } catch {
        // ignore — cold start всё ещё возможен; кнопка покажет DB_TIMEOUT
    }
}

/**
 * Quiz start hot path: один Direct (unpooled) client на pick + snapshot write.
 *
 * Почему не pooler (`DATABASE_URL`): на Windows + `next dev` pooled+12s timeout
 * давал ложный DB_TIMEOUT (~25s), тогда как unpooled admin/list стабильно ~1s.
 * Очередь обязательна: иначе start гоняется с submit/result Direct TLS.
 * Recovery после ошибки — снаружи этого helper (не nested queue).
 */
export async function withDirectPgQuizStartClient<T>(
    operation: (client: Client) => Promise<T>,
    attempts = 2,
) {
    return withDirectPgQueue(async () => {
        let lastError: unknown;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                return await withFreshClient(createDirectClient, operation, {
                    attemptTimeoutMs: READ_ATTEMPT_TIMEOUT_MS,
                    debugLabel: 'quiz.start.direct',
                });
            } catch (error) {
                lastError = error;

                if (!isTransientDirectPgError(error) || attempt === attempts) {
                    throw error;
                }

                await wait(300 * attempt);
            }
        }

        throw lastError;
    });
}
