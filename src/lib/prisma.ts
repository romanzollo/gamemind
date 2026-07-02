import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

// сообщения о временных ошибках базы данных
const TRANSIENT_DATABASE_ERROR_MESSAGES = [
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection ended unexpectedly',
    'not queryable',
    'Transaction already closed',
    'ECONNRESET',
    'ETIMEDOUT',
    'timeout exceeded when trying to connect',
];

const TRANSIENT_DATABASE_ERROR_CODES = new Set(['P1017', 'P2028']);

// глобальный объект для Prisma
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pool: Pool | undefined;
};

function getDatabaseUrl() {
    const pooled = process.env.DATABASE_URL;
    const unpooled = process.env.DATABASE_URL_UNPOOLED;

    // In local dev, prefer direct Neon connection for Prisma interactive writes.
    if (process.env.NODE_ENV !== 'production' && unpooled) {
        return unpooled;
    }

    return pooled;
}

function createPool() {
    const connectionString = getDatabaseUrl();

    if (!connectionString) {
        throw new Error('DATABASE_URL is not set');
    }

    return new Pool({
        connectionString,
        ssl: { rejectUnauthorized: true },
        max: 5,
        keepAlive: true,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 15_000,
    });
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
    if (globalForPrisma.prisma) {
        await globalForPrisma.prisma.$disconnect().catch(() => undefined);
        globalForPrisma.prisma = undefined;
    }

    if (globalForPrisma.pool) {
        await globalForPrisma.pool.end().catch(() => undefined);
        globalForPrisma.pool = undefined;
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
