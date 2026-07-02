import { Client } from 'pg';

const TRANSIENT_DIRECT_PG_ERROR_MESSAGES = [
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection ended unexpectedly',
    'not queryable',
    'Query read timeout',
    'ECONNRESET',
    'ETIMEDOUT',
    'timeout exceeded when trying to connect',
];

function getDirectDatabaseUrl() {
    const connectionString =
        process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
    }

    return connectionString;
}

function createDirectClient() {
    const client = new Client({
        connectionString: getDirectDatabaseUrl(),
        ssl: { rejectUnauthorized: true },
        keepAlive: true,
        connectionTimeoutMillis: 10_000,
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

            await wait(200 * attempt);
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
