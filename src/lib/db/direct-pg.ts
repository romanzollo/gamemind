/**
 * Direct pg helpers for Neon.
 *
 * Critical rules:
 * - Never await client.end() on the response path (Neon close can take ~19s).
 * - On wall-clock timeout, mark aborted SYNCHRONOUSLY and destroy the socket
 *   so a late connect cannot start a query on a half-dead client.
 * - Prefer unpooled URL for admin/quiz reads; pooled+tight timeout was a
 *   known false-failure regression.
 * - In development on Windows, soften SSL and serialize reads: parallel
 *   fresh-Client TLS to Neon is a known wedge (admin full list timeouts).
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
 * 30s×2 (=60s page) was too painful when the first TLS attempt wedged;
 * 12s×2 fails faster and still covers Neon cold wake.
 */
const READ_ATTEMPT_TIMEOUT_MS = 12_000;
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

function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class DirectPgTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Direct pg operation timed out after ${timeoutMs}ms`);
        this.name = 'DirectPgTimeoutError';
    }
}

type TimeoutControl = {
    /** Called synchronously when the wall-clock budget expires. */
    onTimeout?: () => void;
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

/** Fire-and-forget teardown; destroy the socket so late TLS cannot linger. */
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

async function withFreshClient<T>(
    createClientFn: () => Client,
    operation: (client: Client) => Promise<T>,
    options?: {
        attemptTimeoutMs?: number;
    },
): Promise<T> {
    const client = createClientFn();
    let aborted = false;

    const abort = () => {
        aborted = true;
        destroyClient(client);
    };

    try {
        const run = async () => {
            await client.connect();

            if (aborted) {
                throw new DirectPgTimeoutError(
                    options?.attemptTimeoutMs ?? READ_ATTEMPT_TIMEOUT_MS,
                );
            }

            return await operation(client);
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
        // Success path: end without awaiting. Abort path: destroy already ran.
        if (!aborted) {
            destroyClient(client);
        }
    }
}

async function withPgReadRetry<T>(
    operation: () => Promise<T>,
    attempts = READ_MAX_ATTEMPTS,
) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
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
 * Reads via unpooled Neon host. Prefer for admin list/detail and critical
 * quiz reads.
 */
export async function withDirectPgClient<T>(
    operation: (client: Client) => Promise<T>,
) {
    return withPgReadRetry(() =>
        withFreshClient(createDirectClient, operation, readClientOptions),
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

/** Writes: fresh direct client without automatic retry / hard timeout. */
export async function withDirectPgWriteClient<T>(
    operation: (client: Client) => Promise<T>,
) {
    return withFreshClient(createDirectClient, operation);
}

/** Writes with one guarded retry for transient Neon connect/socket errors. */
export async function withDirectPgWriteRetry<T>(
    operation: (client: Client) => Promise<T>,
    attempts = 2,
) {
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
}

/** Quiz start: one connection for question pick + snapshot write. */
export async function withPooledPgQuizStartClient<T>(
    operation: (client: Client) => Promise<T>,
    attempts = 2,
) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await withFreshClient(createPooledClient, operation, {
                attemptTimeoutMs: READ_ATTEMPT_TIMEOUT_MS,
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
}
