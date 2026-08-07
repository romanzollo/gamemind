/**
 * Deduplicate local TEXT questions (same RU text + difficulty).
 * Keep oldest; extras: deactivate then DELETE one-id-per-connection (Neon-safe).
 *
 *   node scripts/dedupe-local-text-questions.cjs --dry-run
 *   node scripts/dedupe-local-text-questions.cjs
 *
 * Refuses prod (red-mountain).
 */

require('dotenv').config();
const { Client } = require('pg');

const dryRun = process.argv.includes('--dry-run');

const TRANSIENT = [
    'Connection terminated unexpectedly',
    'Connection ended unexpectedly',
    'ECONNRESET',
    'ETIMEDOUT',
    'not queryable',
];

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function isTransient(error) {
    const message = error instanceof Error ? error.message : String(error);
    return TRANSIENT.some((p) => message.includes(p));
}

function getUrl() {
    const url = process.env.DATABASE_URL_UNPOOLED;
    if (!url) throw new Error('DATABASE_URL_UNPOOLED required');
    const host = new URL(url).hostname;
    if (host.includes('red-mountain')) {
        throw new Error('Refusing to run against prod red-mountain');
    }
    return { url, host };
}

async function withFreshClient(url, work) {
    const client = new Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15_000,
    });
    client.on('error', (e) => console.warn('pg', e.message));
    await client.connect();
    try {
        return await work(client);
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function withRetry(url, work, attempts = 4) {
    let last;
    for (let i = 1; i <= attempts; i += 1) {
        try {
            return await withFreshClient(url, work);
        } catch (error) {
            last = error;
            if (!isTransient(error) || i === attempts) throw error;
            console.warn(`retry ${i}: ${error.message}`);
            await sleep(800 * i);
        }
    }
    throw last;
}

async function main() {
    const { url, host } = getUrl();
    console.log('Target:', host, dryRun ? '(dry-run)' : '(apply)');

    const ids = await withRetry(url, async (client) => {
        const extras = await client.query(`
          WITH ranked AS (
            SELECT q.id,
                   ROW_NUMBER() OVER (
                     PARTITION BY lower(trim(qt.text)), q.difficulty
                     ORDER BY q."createdAt" ASC, q.id ASC
                   ) AS rn
            FROM "Question" q
            JOIN "QuestionTranslation" qt
              ON qt."questionId" = q.id AND qt.locale = 'ru'::"ContentLocale"
            WHERE q.type = 'TEXT'::"QuestionType"
          )
          SELECT id FROM ranked WHERE rn > 1
        `);
        return extras.rows.map((r) => r.id);
    });

    console.log('TEXT extras found:', ids.length);
    if (ids.length === 0) return;

    const used = await withRetry(url, async (client) => {
        const r = await client.query(
            `
            SELECT DISTINCT x.id
            FROM unnest($1::text[]) AS x(id)
            WHERE EXISTS (
              SELECT 1 FROM "QuizAnswer" qa WHERE qa."questionId" = x.id
            )
            OR EXISTS (
              SELECT 1 FROM "QuizSessionQuestion" sq WHERE sq."questionId" = x.id
            )
            `,
            [ids],
        );
        return new Set(r.rows.map((row) => row.id));
    });

    const toDelete = ids.filter((id) => !used.has(id));
    const toDeactivate = ids.filter((id) => used.has(id));
    console.log('DELETE unused:', toDelete.length);
    console.log('deactivate used:', toDeactivate.length);

    if (dryRun) {
        console.log('Dry-run — no writes.');
        return;
    }

    // Fast: pull extras out of quiz pool first.
    if (ids.length > 0) {
        await withRetry(url, async (client) => {
            await client.query(
                `UPDATE "Question"
                 SET "isActive" = false, "updatedAt" = NOW()
                 WHERE id = ANY($1::text[])`,
                [ids],
            );
        });
        console.log('deactivated all extras');
    }

    let deleted = 0;
    for (const id of toDelete) {
        await withRetry(url, async (client) => {
            await client.query(`DELETE FROM "Question" WHERE id = $1`, [id]);
        });
        deleted += 1;
        if (deleted % 10 === 0 || deleted === toDelete.length) {
            console.log(`deleted ${deleted}/${toDelete.length}`);
        }
        await sleep(200);
    }

    const counts = await withRetry(url, async (client) => {
        const total = await client.query(`SELECT COUNT(*)::int AS c FROM "Question"`);
        const active = await client.query(
            `SELECT COUNT(*)::int AS c FROM "Question" WHERE "isActive" = true`,
        );
        const by = await client.query(`
          SELECT type::text, COUNT(*)::int AS c FROM "Question" GROUP BY 1 ORDER BY 1
        `);
        return { total: total.rows[0].c, active: active.rows[0].c, by: by.rows };
    });

    console.log('Done.', counts);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
