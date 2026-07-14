/**
 * Fast update: point IMAGE_GUESS QuestionAsset rows at optimized WebP URLs.
 * Prefer this after `npm run images:optimize` instead of a full 60-question seed.
 *
 * Usage: npm run images:update-db
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { questions } = require('./seed-questions.cjs');

const TRANSIENT_PG_ERROR_MESSAGES = [
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection ended unexpectedly',
    'not queryable',
    'ECONNRESET',
    'ETIMEDOUT',
    'timeout exceeded when trying to connect',
];

function readEnv(name) {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const match = env.match(new RegExp(`${name}="([^"]+)"`));
    if (!match) throw new Error(`Missing ${name}`);
    return match[1];
}

function isTransientPgError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return TRANSIENT_PG_ERROR_MESSAGES.some((part) => message.includes(part));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getConnectionString() {
    return (
        process.env.DATABASE_URL_UNPOOLED ||
        readEnv('DATABASE_URL_UNPOOLED')
    );
}

async function withFreshClient(work) {
    const client = new Client({
        connectionString: getConnectionString(),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
    });

    client.on('error', (error) => {
        console.warn(`update-quiz-image-assets pg client error: ${error.message}`);
    });

    await client.connect();
    try {
        return await work(client);
    } finally {
        client.end().catch(() => undefined);
    }
}

async function upsertAsset(question, { attempts = 5 } = {}) {
    const assetId = `qa-${question.id}-prompt`;
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await withFreshClient(async (client) => {
                await client.query(
                    `INSERT INTO "QuestionAsset" (
                        id,
                        "questionId",
                        role,
                        url,
                        "mimeType",
                        width,
                        height,
                        "order"
                    )
                    VALUES ($1, $2, 'PROMPT'::"QuestionAssetRole", $3, $4, $5, $6, 0)
                    ON CONFLICT (id) DO UPDATE SET
                        url = EXCLUDED.url,
                        "mimeType" = EXCLUDED."mimeType",
                        width = EXCLUDED.width,
                        height = EXCLUDED.height,
                        role = EXCLUDED.role`,
                    [
                        assetId,
                        question.id,
                        question.promptImage.url,
                        question.promptImage.mimeType ?? 'image/webp',
                        question.promptImage.width ?? 1280,
                        question.promptImage.height ?? 720,
                    ],
                );
            });
            return;
        } catch (error) {
            lastError = error;
            if (!isTransientPgError(error) || attempt === attempts) {
                throw error;
            }
            const delayMs = 1000 * attempt;
            console.warn(
                `Transient Neon error on ${question.id} (attempt ${attempt}/${attempts}): ${error.message}. Retry in ${delayMs}ms`,
            );
            await sleep(delayMs);
        }
    }

    throw lastError;
}

async function main() {
    const imageQuestions = questions.filter((q) => q.type === 'IMAGE_GUESS');
    if (imageQuestions.length === 0) {
        throw new Error('No IMAGE_GUESS questions in seed');
    }

    const publicRoot = path.join(__dirname, '..', 'public');
    for (const question of imageQuestions) {
        const url = question.promptImage.url;
        const filePath = path.join(publicRoot, url.replace(/^\//, ''));
        if (!fs.existsSync(filePath)) {
            throw new Error(`Missing file ${url}. Run npm run images:optimize first.`);
        }
    }

    let updated = 0;
    for (const question of imageQuestions) {
        await upsertAsset(question);
        updated += 1;
        console.log(`Updated ${question.id} → ${question.promptImage.url}`);
        await sleep(400);
    }

    console.log(`Done. Upserted ${updated} QuestionAsset row(s).`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
