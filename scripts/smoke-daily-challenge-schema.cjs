const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function readEnv(name) {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const match = env.match(new RegExp(`${name}="([^"]+)"`));
    if (!match) throw new Error(`Missing ${name}`);
    return match[1];
}

async function main() {
    const client = new Client({
        connectionString: readEnv('DATABASE_URL_UNPOOLED'),
        ssl: { rejectUnauthorized: true },
    });
    await client.connect();

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

    await client.end();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
