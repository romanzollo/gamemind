/**
 * Apply reviewSnapshot + AchievementOutbox if missing (migrate advisory lock bypass).
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        let val = m[2].trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
    }
}

loadEnv();

function normalize(cs) {
    try {
        const u = new URL(cs);
        u.searchParams.delete('sslmode');
        return u.toString();
    } catch {
        return cs;
    }
}

async function withClient(fn) {
    const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    const client = new Client({
        connectionString: normalize(url),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15_000,
        family: 4,
    });
    client.on('error', (error) => {
        console.warn('client_error', error.message);
    });
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function main() {
    await withClient(async (client) => {
        const col = await client.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'QuizResult' AND column_name = 'reviewSnapshot'
        `);
        if (col.rowCount === 0) {
            await client.query(
                `ALTER TABLE "QuizResult" ADD COLUMN "reviewSnapshot" JSONB`,
            );
            console.log('added QuizResult.reviewSnapshot');
        } else {
            console.log('QuizResult.reviewSnapshot already exists');
        }

        const table = await client.query(`
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'AchievementOutbox'
        `);
        if (table.rowCount === 0) {
            await client.query(`
                CREATE TABLE "AchievementOutbox" (
                    "id" TEXT NOT NULL,
                    "userId" TEXT NOT NULL,
                    "sessionId" TEXT NOT NULL,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "processedAt" TIMESTAMP(3),
                    CONSTRAINT "AchievementOutbox_pkey" PRIMARY KEY ("id")
                )
            `);
            await client.query(`
                CREATE UNIQUE INDEX "AchievementOutbox_sessionId_key"
                ON "AchievementOutbox"("sessionId")
            `);
            await client.query(`
                CREATE INDEX "AchievementOutbox_processedAt_createdAt_idx"
                ON "AchievementOutbox"("processedAt", "createdAt")
            `);
            await client.query(`
                CREATE INDEX "AchievementOutbox_userId_idx"
                ON "AchievementOutbox"("userId")
            `);
            await client.query(`
                ALTER TABLE "AchievementOutbox"
                ADD CONSTRAINT "AchievementOutbox_userId_fkey"
                FOREIGN KEY ("userId") REFERENCES "User"("id")
                ON DELETE CASCADE ON UPDATE CASCADE
            `);
            console.log('created AchievementOutbox');
        } else {
            console.log('AchievementOutbox already exists');
        }
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    await withClient(async (client) => {
        const mig = await client.query(`
            SELECT 1 FROM "_prisma_migrations"
            WHERE migration_name = '20260804120000_quiz_result_review_snapshot_outbox'
        `);
        if (mig.rowCount === 0) {
            const sql = fs.readFileSync(
                path.join(
                    __dirname,
                    '..',
                    'prisma/migrations/20260804120000_quiz_result_review_snapshot_outbox/migration.sql',
                ),
                'utf8',
            );
            await client.query(
                `
                INSERT INTO "_prisma_migrations" (
                    id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
                ) VALUES (
                    $1, $2, NOW(), $3, NULL, NULL, NOW(), 1
                )
            `,
                [
                    crypto.randomUUID(),
                    crypto.createHash('sha256').update(sql).digest('hex'),
                    '20260804120000_quiz_result_review_snapshot_outbox',
                ],
            );
            console.log('recorded prisma migration row');
        } else {
            console.log('prisma migration already recorded');
        }
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
