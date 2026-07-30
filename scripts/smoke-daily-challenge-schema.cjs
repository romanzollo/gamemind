/**
 * Smoke: DailyChallenge schema on a chosen DB.
 * Usage:
 *   node scripts/smoke-daily-challenge-schema.cjs
 *   node scripts/smoke-daily-challenge-schema.cjs PROD_DATABASE_URL_UNPOOLED
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function readEnv(name) {
    const fromProcess = process.env[name];
    if (typeof fromProcess === 'string' && fromProcess.trim() !== '') {
        return fromProcess.trim();
    }

    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const match = env.match(new RegExp(`${name}="([^"]+)"`));
    if (!match) throw new Error(`Missing ${name}`);
    return match[1];
}

async function main() {
    const connectionEnvKey = process.argv[2] || 'DATABASE_URL_UNPOOLED';
    const client = new Client({
        connectionString: readEnv(connectionEnvKey),
        ssl: { rejectUnauthorized: true },
    });
    await client.connect();

    console.log(`Checking schema via ${connectionEnvKey}...`);

    const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'DailyChallenge'
        ORDER BY ordinal_position
    `);
    console.log('DailyChallenge columns:');
    console.table(columns.rows);

    const fk = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'QuizSession' AND column_name = 'dailyChallengeId'
    `);
    console.log(
        'QuizSession.dailyChallengeId:',
        fk.rowCount === 1 ? 'OK' : 'MISSING',
    );

    const indexes = await client.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE indexname IN (
            'DailyChallenge_challengeDate_key',
            'QuizSession_dailyChallengeId_idx',
            'QuizSession_userId_dailyChallengeId_key'
        )
        ORDER BY indexname
    `);
    console.log(
        'indexes:',
        indexes.rows.map((row) => row.indexname),
    );

    const migration = await client.query(
        `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1`,
        ['20260729234500_daily_challenge'],
    );
    console.log(
        'migration registered:',
        migration.rowCount === 1 ? 'OK' : 'MISSING',
    );

    await client.end();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
