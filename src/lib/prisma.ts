import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

// сообщения о временных ошибках базы данных
const TRANSIENT_DATABASE_ERROR_MESSAGES = [
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection ended unexpectedly',
    'ECONNRESET',
    'ETIMEDOUT',
    'timeout exceeded when trying to connect',
];

// глобальный объект для Prisma
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pool: Pool | undefined;
};

// пул соединений с базой данных
const pool =
    globalForPrisma.pool ??
    new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: true },
        max: 5,
        keepAlive: true,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 15_000,
    });

// адаптер для Prisma
const adapter = new PrismaPg(pool);

// экземпляр Prisma
export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log:
            process.env.NODE_ENV === 'development'
                ? ['query', 'error', 'warn']
                : ['error'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
    globalForPrisma.pool = pool;
}

// проверка на временную ошибку базы данных
function isTransientDatabaseError(error: unknown) {
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
    attempts = 2,
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

            await wait(100 * attempt);
        }
    }

    throw lastError;
}
