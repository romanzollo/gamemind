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
 * Hard wall-clock budget per read attempt.
 * Must stay above typical Neon cold-wake, but far below the old ~2.5min hangs.
 * Do NOT use a ~12s admin-only budget on pooled URLs — in Next.js that path
 * repeatedly timed out while the same SQL via unpooled (quiz) stayed healthy.
 */
const READ_ATTEMPT_TIMEOUT_MS = 30_000;
const READ_MAX_ATTEMPTS = 2;

export function normalizePgConnectionString(connectionString: string) {
    try {
        const url = new URL(connectionString);
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
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: true },
        keepAlive: true,
        // Best-effort only — on Windows + Neon this often does not abort a stuck
        // TLS handshake. Read paths also use Promise.race + client.end().
        connectionTimeoutMillis: 15_000,
    });

    client.on('error', (error) => {
        if (process.env.NODE_ENV === 'development') {
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

async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            promise,
            new Promise<T>((_resolve, reject) => {
                timeoutId = setTimeout(() => {
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

function endClient(client: Client) {
    // Neon socket close can take ~19s — never await it on the response path.
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
    let settled = false;

    try {
        const run = async () => {
            await client.connect();

            if (settled) {
                throw new DirectPgTimeoutError(
                    options?.attemptTimeoutMs ?? READ_ATTEMPT_TIMEOUT_MS,
                );
            }

            return await operation(client);
        };

        if (options?.attemptTimeoutMs !== undefined) {
            const result = await withTimeout(run(), options.attemptTimeoutMs);
            settled = true;
            return result;
        }

        const result = await run();
        settled = true;
        return result;
    } catch (error) {
        settled = true;
        endClient(client);
        throw error;
    } finally {
        endClient(client);
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

            if (process.env.NODE_ENV === 'development') {
                console.warn(
                    `Direct pg read retry ${attempt}/${attempts}:`,
                    error instanceof Error ? error.message : error,
                );
            }

            await wait(250 * attempt);
        }
    }

    throw lastError;
}

const readClientOptions = {
    attemptTimeoutMs: READ_ATTEMPT_TIMEOUT_MS,
} as const;

/**
 * Reads via unpooled Neon host. Prefer for admin list/detail and critical
 * quiz reads. Hard attempt timeout prevents multi-minute hangs; budget is
 * wide enough for Neon cold wake (unlike the previous 12s admin budget).
 *
 * Note: do not rely on `SET statement_timeout` here — a wall-clock race is
 * enough, and avoids an extra round-trip on every read.
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
 * admin reads timing out — that pattern was observed July 14, 2026.
 */
export async function withPooledPgReadClient<T>(
    operation: (client: Client) => Promise<T>,
) {
    return withPgReadRetry(() =>
        withFreshClient(createPooledClient, operation, readClientOptions),
    );
}

// Writes: fresh direct client without automatic retry / hard timeout.
export async function withDirectPgWriteClient<T>(
    operation: (client: Client) => Promise<T>,
) {
    return withFreshClient(createDirectClient, operation);
}

// Writes with one guarded retry for transient Neon connect/socket errors.
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

/** Quiz start: one connection for question pick + snapshot write (avoids double Neon handshake). */
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
