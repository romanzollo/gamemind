/**
 * Read-only inventory: TEXT question bank (by publicationStatus + quiz pool).
 *
 * Зачем: перед новым TEXT batch / publish понять срез — сколько уже в пуле,
 * есть ли забытые DRAFT. Без записи в БД. Параллель к content:smoke-image-guess.
 *
 * Usage:
 *   npm run content:smoke-text
 *   npm run content:smoke-text -- --target=prod
 *
 * Canon: docs/CONTENT_PIPELINE.md (DRAFT → admin Publish; import ≠ publish).
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');

function loadEnvFile(fileName) {
    const filePath = path.join(ROOT, fileName);
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

function parseArgs(argv) {
    return {
        target: argv.includes('--target=prod') ? 'prod' : 'local',
    };
}

function hostnameOf(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

function resolveConnectionString(target) {
    if (target === 'prod') {
        const url = process.env.PROD_DATABASE_URL_UNPOOLED;
        if (!url) {
            throw new Error(
                'PROD_DATABASE_URL_UNPOOLED is required for --target=prod',
            );
        }
        const host = hostnameOf(url);
        if (host.includes('jolly-river')) {
            throw new Error(
                `Refusing --target=prod: host looks like local Neon (${host})`,
            );
        }
        return url;
    }

    const url =
        process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
    }
    return url;
}

async function withFreshClient(connectionString, run) {
    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 20_000,
        ssl: { rejectUnauthorized: false },
    });
    client.on('error', () => undefined);
    await client.connect();
    try {
        return await run(client);
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function main() {
    loadEnvFile('.env');
    loadEnvFile('.env.local');

    const { target } = parseArgs(process.argv.slice(2));
    const connectionString = resolveConnectionString(target);
    const host = hostnameOf(connectionString);

    const byStatus = await withFreshClient(connectionString, (client) =>
        client.query(
            `
            SELECT
                q."publicationStatus"::text AS status,
                COUNT(*)::int AS n
            FROM "Question" q
            WHERE q."type" = 'TEXT'::"QuestionType"
            GROUP BY 1
            ORDER BY 1
            `,
        ),
    );

    const pool = await withFreshClient(connectionString, (client) =>
        client.query(
            `
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE q."difficulty" = 'EASY')::int AS easy,
                COUNT(*) FILTER (WHERE q."difficulty" = 'MEDIUM')::int AS medium,
                COUNT(*) FILTER (WHERE q."difficulty" = 'HARD')::int AS hard
            FROM "Question" q
            WHERE q."type" = 'TEXT'::"QuestionType"
              AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
              AND q."isActive" = true
            `,
        ),
    );

    const draftCount =
        byStatus.rows.find((row) => row.status === 'DRAFT')?.n ?? 0;
    const inReviewCount =
        byStatus.rows.find((row) => row.status === 'IN_REVIEW')?.n ?? 0;
    const publishedCount =
        byStatus.rows.find((row) => row.status === 'PUBLISHED')?.n ?? 0;

    const p = pool.rows[0];

    console.log(`TEXT bank status (${target})`);
    console.log(`  host: ${host || '(unknown)'}`);
    console.log('\nBy publicationStatus:');
    for (const row of byStatus.rows) {
        console.log(`  ${row.status}: ${row.n}`);
    }
    if (byStatus.rows.length === 0) {
        console.log('  (no TEXT rows)');
    }

    console.log('\nQuiz pool (TEXT PUBLISHED + isActive):');
    console.log(`  total: ${p.total}`);
    console.log(
        `  by difficulty: EASY ${p.easy} · MEDIUM ${p.medium} · HARD ${p.hard}`,
    );

    console.log('\nOps hint:');
    if (draftCount > 0 || inReviewCount > 0) {
        console.log(
            `  Pending review/publish: DRAFT=${draftCount}, IN_REVIEW=${inReviewCount}`,
        );
        console.log('  Admin: /ru/admin/questions?publication=DRAFT&type=TEXT');
    } else {
        console.log(
            `  No DRAFT/IN_REVIEW — bank is published (${publishedCount}).`,
        );
        console.log(
            '  Next growth: author content/drafts/batches/YYYY-MM-DD-text-….json',
        );
        console.log(
            '  then: npm run content:validate-drafts -- <file> → import → admin Publish.',
        );
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
