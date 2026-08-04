/**
 * Apply QuizResult.reviewPayload if missing (migrate advisory lock bypass).
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

async function main() {
    const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    const client = new Client({
        connectionString: normalize(url),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15_000,
        family: 4,
    });
    await client.connect();

    try {
        const col = await client.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'QuizResult' AND column_name = 'reviewPayload'
        `);

        if (col.rowCount === 0) {
            await client.query(
                `ALTER TABLE "QuizResult" ADD COLUMN "reviewPayload" JSONB`,
            );
            console.log('added QuizResult.reviewPayload');
        } else {
            console.log('QuizResult.reviewPayload already exists');
        }

        const name = '20260804160000_quiz_result_review_payload';
        const mig = await client.query(
            `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1`,
            [name],
        );

        if (mig.rowCount === 0) {
            const sql = fs.readFileSync(
                path.join(
                    __dirname,
                    '..',
                    'prisma/migrations',
                    name,
                    'migration.sql',
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
                    name,
                ],
            );
            console.log('recorded prisma migration row');
        } else {
            console.log('prisma migration already recorded');
        }
    } finally {
        await client.end().catch(() => undefined);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
