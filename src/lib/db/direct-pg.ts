import { Client } from 'pg';

const TRANSIENT_DIRECT_PG_ERROR_MESSAGES = [
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection ended unexpectedly',
    'not queryable',
    'Query read timeout',
    'ECONNRESET',
    'ETIMEDOUT',
    'timeout expired',
    'timeout exceeded when trying to connect',
];

const DEPRECATED_SSL_MODES = new Set(['prefer', 'require', 'verify-ca']);

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

function createDirectClient() {
    const client = new Client({
        connectionString: getDirectDatabaseUrl(),
        ssl: { rejectUnauthorized: true },
        keepAlive: true,
        connectionTimeoutMillis: 15_000,
    });

    client.on('error', (error) => {
        if (process.env.NODE_ENV === 'development') {
            console.warn('Direct pg client error:', error.message);
        }
    });

    return client;
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

async function withFreshClient<T>(
    operation: (client: Client) => Promise<T>,
): Promise<T> {
    const client = createDirectClient();

    await client.connect();

    try {
        return await operation(client);
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function withDirectPgReadRetry<T>(
    operation: () => Promise<T>,
    attempts = 3,
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

            await wait(250 * attempt);
        }
    }

    throw lastError;
}

// Reads: fresh direct client per attempt (same pattern as scripts/seed.cjs).
export async function withDirectPgClient<T>(
    operation: (client: Client) => Promise<T>,
) {
    return withDirectPgReadRetry(() => withFreshClient(operation));
}

// Writes: fresh direct client without automatic retry.
export async function withDirectPgWriteClient<T>(
    operation: (client: Client) => Promise<T>,
) {
    return withFreshClient(operation);
}

// Writes with one guarded retry for transient Neon connect/socket errors.
export async function withDirectPgWriteRetry<T>(
    operation: (client: Client) => Promise<T>,
    attempts = 2,
) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await withFreshClient(operation);
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
