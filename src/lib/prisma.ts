import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { normalizePgConnectionString } from '@/lib/db/direct-pg';

// сообщения о временных ошибках базы данных
const TRANSIENT_DATABASE_ERROR_MESSAGES = [
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection ended unexpectedly',
    'not queryable',
    'Transaction already closed',
    'ECONNRESET',
    'ETIMEDOUT',
    'timeout expired',
    'timeout exceeded when trying to connect',
];

const TRANSIENT_DATABASE_ERROR_CODES = new Set(['P1017', 'P2028']);

// глобальный объект для Prisma
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pool: Pool | undefined;
};

function getDatabaseUrl() {
    // Prisma reads/admin use the pooled Neon URL when available.
    // Critical quiz writes use direct pg via DATABASE_URL_UNPOOLED separately.
    return process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;
}

function createPool() {
    const connectionString = getDatabaseUrl();

    if (!connectionString) {
        throw new Error('DATABASE_URL is not set');
    }

    const pool = new Pool({
        connectionString: normalizePgConnectionString(connectionString),
        ssl: { rejectUnauthorized: true },
        max: 5,
        keepAlive: true,
        idleTimeoutMillis:
            process.env.NODE_ENV === 'production' ? 5_000 : 30_000,
        connectionTimeoutMillis: 15_000,
        // Windows + Neon: prefer IPv4 (same as direct-pg).
        ...({ family: 4 } as object),
    });

    pool.on('error', (error) => {
        if (process.env.NODE_ENV === 'development') {
            console.warn('Prisma pg pool error:', error.message);
        }
    });

    void pool.query('SELECT 1').catch(() => undefined);

    return pool;
}

function createPrismaClient(pool: Pool) {
    const adapter = new PrismaPg(pool);

    return new PrismaClient({
        adapter,
        log:
            process.env.NODE_ENV === 'development'
                ? ['query', 'error', 'warn']
                : ['error'],
    });
}

function getPrismaClient(): PrismaClient {
    if (!globalForPrisma.pool) {
        globalForPrisma.pool = createPool();
    }

    if (!globalForPrisma.prisma) {
        globalForPrisma.prisma = createPrismaClient(globalForPrisma.pool);
    }

    return globalForPrisma.prisma;
}

async function resetDatabaseConnection() {
    const pool = globalForPrisma.pool;
    const client = globalForPrisma.prisma;

    globalForPrisma.prisma = undefined;
    globalForPrisma.pool = undefined;

    // Neon socket teardown can take ~19s — do not await on the request path.
    // Awaiting pool.end() previously turned one transient error into multi-minute hangs.
    if (client) {
        void client.$disconnect().catch(() => undefined);
    }

    if (pool) {
        void pool.end().catch(() => undefined);
    }
}

export const prisma = new Proxy({} as PrismaClient, {
    get(_target, property, receiver) {
        const client = getPrismaClient();
        const value = Reflect.get(client, property, receiver);

        return typeof value === 'function'
            ? (value as (...args: unknown[]) => unknown).bind(client)
            : value;
    },
});

// проверка на временную ошибку базы данных
function isTransientDatabaseError(error: unknown) {
    if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string' &&
        TRANSIENT_DATABASE_ERROR_CODES.has(error.code)
    ) {
        return true;
    }

    return (
        error instanceof Error &&
        TRANSIENT_DATABASE_ERROR_MESSAGES.some((message) =>
            error.message.includes(message),
        )
    );
}

// ожидание в миллисекундах
function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// повторная попытка операции с базой данных
export async function withDatabaseRetry<T>(
    operation: () => Promise<T>,
    attempts = 3,
) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (!isTransientDatabaseError(error) || attempt === attempts) {
                throw error;
            }

            await resetDatabaseConnection();
            await wait(250 * attempt);
        }
    }

    throw lastError;
}
