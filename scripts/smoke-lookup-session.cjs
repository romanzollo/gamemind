const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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
    const id = process.argv[2] || 'c2df4b4f-e15c-4827-a8e1-44f4fab68ccc';
    const client = new Client({
        connectionString: normalize(
            process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
        ),
        ssl: { rejectUnauthorized: false },
        family: 4,
        connectionTimeoutMillis: 15_000,
    });
    client.on('error', () => undefined);
    await client.connect();

    const exact = await client.query(
        `
        SELECT
            id,
            status::text,
            "questionCount",
            "userId",
            "snapshotData" IS NOT NULL AS has_snap,
            octet_length("snapshotData"::text) AS snap_bytes,
            "startedAt"
        FROM "QuizSession"
        WHERE id = $1
        `,
        [id],
    );
    console.log('exact', exact.rows);

    const recent = await client.query(`
        SELECT
            id,
            status::text,
            "questionCount",
            "snapshotData" IS NOT NULL AS has_snap,
            "startedAt"
        FROM "QuizSession"
        ORDER BY "startedAt" DESC
        LIMIT 8
    `);
    console.log('recent', recent.rows);

    await client.end();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
