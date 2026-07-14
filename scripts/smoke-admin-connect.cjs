/**
 * Diagnose pooled vs unpooled Neon connect + SET statement_timeout.
 * Usage: node scripts/smoke-admin-connect.cjs
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function loadEnvFile(fileName) {
    const filePath = path.join(__dirname, '..', fileName);
    if (!fs.existsSync(filePath)) return;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`timeout ${timeoutMs}ms`)),
            timeoutMs,
        );
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

async function tryUrl(label, url, withSet) {
    const t0 = Date.now();
    const client = new Client({
        connectionString: normalize(url),
        ssl: { rejectUnauthorized: true },
        connectionTimeoutMillis: 10_000,
    });

    try {
        await withTimeout(
            (async () => {
                await client.connect();
                console.log(`${label}: connected ${Date.now() - t0}ms`);

                if (withSet) {
                    const t1 = Date.now();
                    await client.query('SET statement_timeout = 8000');
                    console.log(`${label}: SET ok ${Date.now() - t1}ms`);
                }

                const t2 = Date.now();
                const result = await client.query(
                    'SELECT COUNT(*)::int AS n FROM "Question"',
                );
                console.log(
                    `${label}: query ${Date.now() - t2}ms n=${result.rows[0].n}`,
                );
            })(),
            15_000,
        );
    } catch (error) {
        console.log(
            `${label}: FAIL ${error.message} at ${Date.now() - t0}ms`,
        );
    } finally {
        void client.end().catch(() => undefined);
    }
}

(async () => {
    const pooled = process.env.DATABASE_URL;
    const unpooled =
        process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

    if (!unpooled) {
        console.error('missing DATABASE_URL');
        process.exit(1);
    }

    console.log(
        'pooled host',
        pooled ? new URL(pooled).hostname : 'missing',
    );
    console.log('unpooled host', new URL(unpooled).hostname);

    await tryUrl('unpooled-no-set', unpooled, false);
    await tryUrl('unpooled-with-set', unpooled, true);

    if (pooled) {
        await tryUrl('pooled-no-set', pooled, false);
        await tryUrl('pooled-with-set', pooled, true);
    }
})();
