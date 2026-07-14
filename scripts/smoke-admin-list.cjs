/**
 * Smoke: admin question list query latency (same SQL as findAllForAdmin).
 * Usage: node scripts/smoke-admin-list.cjs
 */
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

function loadEnvFile(fileName) {
    const filePath = path.join(__dirname, '..', fileName);
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

function normalize(connectionString) {
    try {
        const url = new URL(connectionString);
        const sslmode = url.searchParams.get('sslmode');
        if (!sslmode || ['prefer', 'require', 'verify-ca'].includes(sslmode)) {
            url.searchParams.set('sslmode', 'verify-full');
        }
        return url.toString();
    } catch {
        return connectionString;
    }
}

const SQL = `
SELECT
    q."id",
    COALESCE(active_translation."text", default_translation."text", q."text") AS "text",
    q."difficulty"::text AS "difficulty",
    q."category",
    q."isActive",
    q."createdAt",
    COALESCE(option_counts."optionsCount", 0)::int AS "optionsCount"
FROM "Question" q
LEFT JOIN "QuestionTranslation" active_translation
    ON active_translation."questionId" = q."id"
    AND active_translation."locale" = $1::"ContentLocale"
LEFT JOIN "QuestionTranslation" default_translation
    ON default_translation."questionId" = q."id"
    AND default_translation."locale" = $2::"ContentLocale"
LEFT JOIN (
    SELECT "questionId", COUNT(*)::int AS "optionsCount"
    FROM "AnswerOption"
    GROUP BY "questionId"
) option_counts ON option_counts."questionId" = q."id"
ORDER BY q."createdAt" DESC
`;

function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

async function runOnce(label, connectionString) {
    const t0 = Date.now();
    const client = new Client({
        connectionString: normalize(connectionString),
        ssl: { rejectUnauthorized: true },
        connectionTimeoutMillis: 15_000,
    });

    try {
        // Match app budget: wall-clock only, no SET statement_timeout.
        await withTimeout(
            (async () => {
                await client.connect();
                const connectMs = Date.now() - t0;
                const t1 = Date.now();
                const result = await client.query(SQL, ['ru', 'ru']);
                const queryMs = Date.now() - t1;
                console.log(
                    `${label}: connect=${connectMs}ms query=${queryMs}ms rows=${result.rowCount} total=${Date.now() - t0}ms`,
                );
            })(),
            30_000,
        );
    } finally {
        void client.end().catch(() => undefined);
    }
}

(async () => {
    const pooled = process.env.DATABASE_URL;
    const unpooled = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

    if (!unpooled) {
        console.error('DATABASE_URL_UNPOOLED / DATABASE_URL missing');
        process.exit(1);
    }

    console.log('--- attempt 1 (cold-ish) ---');
    await runOnce('unpooled', unpooled);
    if (pooled && pooled !== unpooled) {
        await runOnce('pooled', pooled);
    }

    console.log('--- attempt 2 (warm) ---');
    await runOnce('unpooled', unpooled);
    if (pooled && pooled !== unpooled) {
        await runOnce('pooled', pooled);
    }
})().catch((error) => {
    console.error('FAIL', error.message);
    process.exit(1);
});
