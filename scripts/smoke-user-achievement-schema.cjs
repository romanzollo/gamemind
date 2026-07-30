/**
 * Smoke: UserAchievement schema on a chosen DB.
 * Usage:
 *   node scripts/smoke-user-achievement-schema.cjs
 *   node scripts/smoke-user-achievement-schema.cjs PROD_DATABASE_URL_UNPOOLED
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
        WHERE table_name = 'UserAchievement'
        ORDER BY ordinal_position
    `);
    console.log('UserAchievement columns:');
    console.table(columns.rows);

    const indexes = await client.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE indexname IN (
            'UserAchievement_userId_code_key',
            'UserAchievement_userId_idx'
        )
        ORDER BY indexname
    `);
    console.log('Indexes:');
    console.table(indexes.rows);

    const fk = await client.query(`
        SELECT conname
        FROM pg_constraint
        WHERE conname = 'UserAchievement_userId_fkey'
    `);
    console.log(
        'UserAchievement_userId_fkey:',
        fk.rowCount === 1 ? 'OK' : 'MISSING',
    );

    const ok =
        columns.rowCount === 4 &&
        indexes.rowCount === 2 &&
        fk.rowCount === 1;

    console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL');
    await client.end();
    process.exit(ok ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
