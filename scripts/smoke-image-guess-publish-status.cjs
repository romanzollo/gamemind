/**
 * Read-only inventory: IMAGE_GUESS batch (`img-*`) + quiz-pool counts.
 *
 * Зачем: 90 DRAFT уже импортированы (local + prod). Перед / после Publish
 * нужно увидеть срез: сколько DRAFT / PUBLISHED, есть ли PROMPT asset, лежит ли
 * WebP на диске, сколько IMAGE_GUESS реально в quiz pool (PUBLISHED+active).
 * Без записи в БД — не ломаем CONTENT_PIPELINE (import ≠ publish).
 *
 * Usage:
 *   npm run content:smoke-image-guess
 *   npm run content:smoke-image-guess -- --target=prod
 *
 * Canon: docs/QUIZ_IMAGES.md §5–§6; docs/CONTENT_PIPELINE.md (DRAFT → admin Publish).
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');

/** Стабильные id батча Aug 2026 — prefix `img-` (см. draftKey в манифесте). */
const BATCH_ID_PREFIX = 'img-';

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

/**
 * Local → DATABASE_URL_UNPOOLED; prod → PROD_DATABASE_URL_UNPOOLED.
 * Отказ, если prod URL указывает на local host (jolly-river) — урок Aug 4.
 */
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

/** `/quiz-images/easy/foo.webp` → `public/quiz-images/easy/foo.webp` */
function publicPathFromAssetUrl(assetUrl) {
    if (!assetUrl || typeof assetUrl !== 'string') return null;
    if (!assetUrl.startsWith('/quiz-images/')) return null;
    return path.join(ROOT, 'public', assetUrl.replace(/^\//, ''));
}

/**
 * Один короткий hop на свежем Client (Neon Windows: длинная сессия + 2-й query
 * часто даёт Connection terminated — как у import-image-guess-batch).
 */
async function withFreshClient(connectionString, run) {
    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 20_000,
        ssl: { rejectUnauthorized: false },
    });
    // Иначе mid-flight drop роняет process через unhandled 'error'.
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

    const result = await withFreshClient(connectionString, (client) =>
        client.query(
            `
            SELECT
                q."id",
                q."difficulty"::text AS difficulty,
                q."publicationStatus"::text AS "publicationStatus",
                q."isActive",
                q."type"::text AS type,
                a."url" AS "promptUrl"
            FROM "Question" q
            LEFT JOIN "QuestionAsset" a
                ON a."questionId" = q."id"
               AND a."role" = 'PROMPT'::"QuestionAssetRole"
            WHERE q."id" LIKE $1
            ORDER BY q."difficulty"::text, q."id"
            `,
            [`${BATCH_ID_PREFIX}%`],
        ),
    );

    console.log(`IMAGE_GUESS batch status (${target})`);
    console.log(`  host: ${host || '(unknown)'}`);
    console.log(`  filter: id LIKE '${BATCH_ID_PREFIX}%'`);
    console.log(`  rows: ${result.rows.length}\n`);

    if (result.rows.length === 0) {
        console.error(
            'No img-* rows. Import first:\n  npm run content:import-image-guess',
        );
        process.exit(1);
    }

    const byStatus = new Map();
    const byDifficulty = new Map();
    let missingPrompt = 0;
    let missingWebpOnDisk = 0;
    let wrongType = 0;
    let inactive = 0;
    /** DRAFT + active + PROMPT + WebP on disk — готовы к admin Publish. */
    let readyToPublish = 0;

    const missingPromptIds = [];
    const missingWebpIds = [];

    for (const row of result.rows) {
        byStatus.set(
            row.publicationStatus,
            (byStatus.get(row.publicationStatus) ?? 0) + 1,
        );
        byDifficulty.set(
            row.difficulty,
            (byDifficulty.get(row.difficulty) ?? 0) + 1,
        );

        if (row.type !== 'IMAGE_GUESS') {
            wrongType += 1;
        }
        if (!row.isActive) {
            inactive += 1;
        }

        const hasPrompt = Boolean(row.promptUrl);
        if (!hasPrompt) {
            missingPrompt += 1;
            if (missingPromptIds.length < 8) {
                missingPromptIds.push(row.id);
            }
        }

        let webpOk = false;
        if (hasPrompt) {
            const diskPath = publicPathFromAssetUrl(row.promptUrl);
            webpOk = Boolean(diskPath && fs.existsSync(diskPath));
            if (!webpOk) {
                missingWebpOnDisk += 1;
                if (missingWebpIds.length < 8) {
                    missingWebpIds.push(`${row.id} → ${row.promptUrl}`);
                }
            }
        }

        if (
            row.publicationStatus === 'DRAFT' &&
            row.isActive &&
            hasPrompt &&
            webpOk &&
            row.type === 'IMAGE_GUESS'
        ) {
            readyToPublish += 1;
        }
    }

    console.log('By publicationStatus:');
    for (const [status, count] of [...byStatus.entries()].sort()) {
        console.log(`  ${status}: ${count}`);
    }

    console.log('\nBy difficulty:');
    for (const [diff, count] of [...byDifficulty.entries()].sort()) {
        console.log(`  ${diff}: ${count}`);
    }

    console.log('\nReadiness checks:');
    console.log(`  missing PROMPT asset: ${missingPrompt}`);
    console.log(`  PROMPT url but WebP missing on disk: ${missingWebpOnDisk}`);
    console.log(`  wrong type (not IMAGE_GUESS): ${wrongType}`);
    console.log(`  isActive=false: ${inactive}`);
    console.log(
        `  ready for admin Publish (DRAFT+active+PROMPT+WebP): ${readyToPublish}`,
    );

    if (missingPromptIds.length > 0) {
        console.log('\nSample missing PROMPT:');
        for (const id of missingPromptIds) console.log(`  - ${id}`);
    }
    if (missingWebpIds.length > 0) {
        console.log('\nSample missing WebP on disk:');
        for (const line of missingWebpIds) console.log(`  - ${line}`);
    }

    // Отдельный hop: quiz pool = то, что pick видит на Classic/Blitz.
    const pool = await withFreshClient(connectionString, (client) =>
        client.query(
            `
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE q."id" LIKE $1)::int AS "batchImg",
                COUNT(*) FILTER (WHERE q."id" NOT LIKE $1)::int AS "seedOrOther",
                COUNT(*) FILTER (WHERE q."difficulty" = 'EASY')::int AS easy,
                COUNT(*) FILTER (WHERE q."difficulty" = 'MEDIUM')::int AS medium,
                COUNT(*) FILTER (WHERE q."difficulty" = 'HARD')::int AS hard
            FROM "Question" q
            WHERE q."type" = 'IMAGE_GUESS'::"QuestionType"
              AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
              AND q."isActive" = true
            `,
            [`${BATCH_ID_PREFIX}%`],
        ),
    );

    const p = pool.rows[0];
    console.log('\nQuiz pool (IMAGE_GUESS PUBLISHED + isActive):');
    console.log(`  total: ${p.total}`);
    console.log(`  batch img-*: ${p.batchImg}`);
    console.log(`  seed / other: ${p.seedOrOther}`);
    console.log(
        `  by difficulty: EASY ${p.easy} · MEDIUM ${p.medium} · HARD ${p.hard}`,
    );

    console.log('\nNext (manual UI smoke — this script does not write):');
    console.log('  See docs/QUIZ_IMAGES.md §6 lightbox / quiz smoke checklist.');
    console.log(
        '  Classic Easy 10Q local: expect IMAGE_GUESS in set when pool is large.',
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
