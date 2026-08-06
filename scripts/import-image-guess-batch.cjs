/**
 * Import IMAGE_GUESS batch (90) from content/drafts/batches/2026-08-05-image-guess-90.json.
 *
 * Neon pattern = scripts/seed.cjs + scripts/update-quiz-image-assets.cjs:
 * - fresh Client per question (withRetry)
 * - client.on('error') so unhandled drops don't kill the process
 * - ssl rejectUnauthorized: false
 * - sleep between questions
 * - bulk INSERT for options / translations (few round-trips)
 *
 * Contract (docs/QUIZ_IMAGES.md §5, CONTENT_PIPELINE.md):
 * - Always DRAFT on first insert (never auto-PUBLISH)
 * - PROMPT QuestionAsset pointing at /quiz-images/...webp
 * - Stable ids from draftKey → re-run upserts content, keeps publicationStatus
 *
 * Usage:
 *   npm run content:import-image-guess -- --dry-run
 *   npm run content:import-image-guess
 *   npm run content:import-image-guess -- --target=prod
 *
 * Prod needs PROD_DATABASE_URL_UNPOOLED in .env (never commit secrets).
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const BATCH_PATH = path.join(
    ROOT,
    'content/drafts/batches/2026-08-05-image-guess-90.json',
);

const LOCALES = ['ru', 'en'];

const TRANSIENT_PG_ERROR_MESSAGES = [
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection ended unexpectedly',
    'not queryable',
    'ECONNRESET',
    'ETIMEDOUT',
    'timeout exceeded when trying to connect',
];

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
        dryRun: argv.includes('--dry-run'),
        target: argv.includes('--target=prod') ? 'prod' : 'local',
    };
}

function hostnameOf(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return '(bad)';
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientPgError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return TRANSIENT_PG_ERROR_MESSAGES.some((part) => message.includes(part));
}

function resolveConnectionString(target) {
    if (target === 'prod') {
        const url =
            process.env.PROD_DATABASE_URL_UNPOOLED ||
            process.env.PROD_DATABASE_URL;
        if (!url) {
            throw new Error(
                'PROD_DATABASE_URL_UNPOOLED (or PROD_DATABASE_URL) is required for --target=prod',
            );
        }
        return url;
    }
    const url =
        process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
    }
    return url;
}

/** Синхронный лог — при redirect stdout Node буферизует console.log и кажется, что скрипт завис. */
function log(message) {
    fs.writeSync(1, `${message}\n`);
}

function createClient(connectionString) {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        keepAlive: true,
        connectionTimeoutMillis: 15_000,
        // Без query_timeout: он рвёт клиент после успешного INSERT и оставляет
        // idle ClientRead зомби → Neon упирается в лимит коннектов.
    });

    client.on('error', (error) => {
        fs.writeSync(
            2,
            `import-image-guess pg client error: ${error.message}\n`,
        );
    });

    return client;
}

async function withFreshClient(connectionString, work) {
    const client = createClient(connectionString);
    await client.connect();
    try {
        return await work(client);
    } finally {
        try {
            await Promise.race([
                client.end(),
                sleep(5_000).then(() => {
                    // Принудительно рвём сокет, если end() завис после успешного query.
                    if (typeof client.destroy === 'function') {
                        client.destroy();
                    }
                }),
            ]);
        } catch {
            /* ignore close errors */
        }
    }
}

async function withRetry(connectionString, work, { attempts = 5 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await withFreshClient(connectionString, work);
        } catch (error) {
            lastError = error;
            if (!isTransientPgError(error) || attempt === attempts) {
                throw error;
            }
            const delayMs = 1000 * attempt;
            fs.writeSync(
                2,
                `Transient Neon error (attempt ${attempt}/${attempts}): ${error.message}. Retry in ${delayMs}ms\n`,
            );
            await sleep(delayMs);
        }
    }
    throw lastError;
}

async function terminateOtherBackends(connectionString) {
    await withFreshClient(connectionString, async (client) => {
        const killed = await client.query(`
          SELECT pid, pg_terminate_backend(pid) AS ok
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND state IN ('idle', 'idle in transaction', 'idle in transaction (aborted)')
            AND query_start < NOW() - INTERVAL '10 seconds'
        `);
        if (killed.rows.length > 0) {
            log(`Cleared ${killed.rows.length} stale backend(s)`);
        }
    });
}

async function isCompleteImageGuess(client, questionId) {
    const result = await client.query(
        `
        SELECT 1
        FROM "Question" q
        INNER JOIN "QuestionAsset" a
          ON a."questionId" = q.id
         AND a.role = 'PROMPT'::"QuestionAssetRole"
        WHERE q.id = $1
        LIMIT 1
        `,
        [questionId],
    );
    return result.rows.length > 0;
}

/**
 * Стабильный id = draftKey (как seed использует q-…).
 * Re-run upsert'ит контент; publicationStatus / isActive не трогаем при conflict.
 */
async function upsertImageGuess(client, question) {
    const questionId = question.draftKey;
    const ruText = question.translations.ru.text;
    const metadata = {
        ...question.metadata,
        draftKey: question.draftKey,
        imageStem: question.imageStem,
        batch: '2026-08-05-image-guess-90',
    };

    const existing = await client.query(
        `SELECT id, "publicationStatus" FROM "Question" WHERE id = $1`,
        [questionId],
    );
    const wasExisting = existing.rows.length > 0;

    await client.query(
        `INSERT INTO "Question" (
            id, text, type, difficulty, category, metadata,
            "isActive", "publicationStatus", "createdAt", "updatedAt"
        ) VALUES (
            $1, $2, 'IMAGE_GUESS'::"QuestionType", $3::"Difficulty", $4, $5::jsonb,
            true, 'DRAFT'::"QuestionPublicationStatus", NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            text = EXCLUDED.text,
            type = EXCLUDED.type,
            difficulty = EXCLUDED.difficulty,
            category = EXCLUDED.category,
            metadata = EXCLUDED.metadata,
            "updatedAt" = NOW()`,
        [
            questionId,
            ruText,
            question.difficulty,
            question.category || 'video-games',
            JSON.stringify(metadata),
        ],
    );

    const questionTranslationValues = LOCALES.map(
        (_, index) =>
            `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}::"ContentLocale", $${index * 4 + 4})`,
    );
    const questionTranslationParams = LOCALES.flatMap((locale) => [
        `qt-${questionId}-${locale}`,
        questionId,
        locale,
        question.translations[locale].text,
    ]);

    await client.query(
        `INSERT INTO "QuestionTranslation" ("id", "questionId", "locale", "text")
         VALUES ${questionTranslationValues.join(', ')}
         ON CONFLICT ("questionId", "locale") DO UPDATE SET
           text = EXCLUDED.text`,
        questionTranslationParams,
    );

    const optionValues = [];
    const optionParams = [];
    let optionParamIndex = 1;

    for (let index = 0; index < question.options.length; index += 1) {
        const option = question.options[index];
        const optionId = `${questionId}-opt-${index}`;
        optionValues.push(
            `($${optionParamIndex}, $${optionParamIndex + 1}, $${optionParamIndex + 2}, $${optionParamIndex + 3}, $${optionParamIndex + 4})`,
        );
        optionParams.push(
            optionId,
            questionId,
            option.translations.ru.text,
            option.isCorrect,
            index,
        );
        optionParamIndex += 5;
    }

    await client.query(
        `INSERT INTO "AnswerOption" (
            id, "questionId", text, "isCorrect", "order"
        )
        VALUES ${optionValues.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
            text = EXCLUDED.text,
            "isCorrect" = EXCLUDED."isCorrect",
            "order" = EXCLUDED."order"`,
        optionParams,
    );

    const translationValues = [];
    const translationParams = [];
    let translationParamIndex = 1;

    for (let index = 0; index < question.options.length; index += 1) {
        const option = question.options[index];
        const optionId = `${questionId}-opt-${index}`;
        for (const locale of LOCALES) {
            translationValues.push(
                `($${translationParamIndex}, $${translationParamIndex + 1}, $${translationParamIndex + 2}::"ContentLocale", $${translationParamIndex + 3})`,
            );
            translationParams.push(
                `aot-${optionId}-${locale}`,
                optionId,
                locale,
                option.translations[locale].text,
            );
            translationParamIndex += 4;
        }
    }

    await client.query(
        `INSERT INTO "AnswerOptionTranslation" ("id", "optionId", "locale", "text")
         VALUES ${translationValues.join(', ')}
         ON CONFLICT ("optionId", "locale") DO UPDATE SET
           text = EXCLUDED.text`,
        translationParams,
    );

    return { questionId, wasExisting };
}

async function upsertAssetOnly(client, question) {
    const questionId = question.draftKey;
    const assetId = `qa-${questionId}-prompt`;
    await client.query(
        `INSERT INTO "QuestionAsset" (
            id, "questionId", role, url, "mimeType", width, height, "order"
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
            questionId,
            question.promptImageUrl,
            'image/webp',
            1280,
            720,
        ],
    );
}

async function main() {
    loadEnvFile('.env');
    loadEnvFile('.env.local');

    const options = parseArgs(process.argv.slice(2));
    const batch = JSON.parse(fs.readFileSync(BATCH_PATH, 'utf8'));

    if (batch.kind !== 'IMAGE_GUESS_BATCH') {
        throw new Error('Unexpected batch kind');
    }

    const missingWebp = [];
    for (const question of batch.questions) {
        const webpPath = path.join(
            ROOT,
            'public',
            'quiz-images',
            question.imageFolder,
            `${question.imageStem}.webp`,
        );
        if (!fs.existsSync(webpPath)) {
            missingWebp.push(
                path.relative(ROOT, webpPath).replace(/\\/g, '/'),
            );
        }
    }
    if (missingWebp.length > 0) {
        console.error(
            `Missing ${missingWebp.length} WebP file(s). Run: npm run images:optimize`,
        );
        for (const file of missingWebp.slice(0, 15)) {
            console.error(' ', file);
        }
        process.exit(1);
    }

    const connectionString = resolveConnectionString(options.target);
    const host = hostnameOf(connectionString);

    if (options.target === 'prod' && host.includes('jolly-river')) {
        throw new Error('Refusing prod import to local jolly-river host');
    }
    if (options.target === 'local' && host.includes('red-mountain')) {
        throw new Error('Refusing local import to prod red-mountain host');
    }

    log(`Target: ${options.target} (${host})`);
    log(`Questions: ${batch.questions.length}`);
    log(
        `Mode: ${options.dryRun ? 'dry-run' : 'import DRAFT (seed-style upsert)'}`,
    );

    if (options.dryRun) {
        log('Dry-run OK — all WebP present.');
        return;
    }

    await terminateOtherBackends(connectionString);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < batch.questions.length; i += 1) {
        const question = batch.questions[i];
        const questionId = question.draftKey;

        const alreadyDone = await withRetry(connectionString, (client) =>
            isCompleteImageGuess(client, questionId),
        );
        if (alreadyDone) {
            skipped += 1;
            log(`skip  ${i + 1}/${batch.questions.length} ${questionId}`);
            await sleep(150);
            continue;
        }

        const result = await withRetry(connectionString, (client) =>
            upsertImageGuess(client, question),
        );
        // Отдельный fresh client на asset — как update-quiz-image-assets.cjs.
        await withRetry(connectionString, (client) =>
            upsertAssetOnly(client, question),
        );

        if (result.wasExisting) {
            updated += 1;
            log(`upd   ${i + 1}/${batch.questions.length} ${result.questionId}`);
        } else {
            created += 1;
            log(`add   ${i + 1}/${batch.questions.length} ${result.questionId}`);
        }

        // Как seed.cjs — пауза между вопросами, меньше шансов half-open на Neon.
        await sleep(500);

        // Периодически сбрасываем idle зомби (Windows/Neon half-open).
        if ((i + 1) % 15 === 0) {
            await terminateOtherBackends(connectionString).catch(() => undefined);
        }
    }

    log(`Done. created=${created} updated=${updated} skipped=${skipped}`);
    log('Next: Admin → DRAFT filter → review → Publish (quality gate).');
}

main().catch((error) => {
    fs.writeSync(
        2,
        `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exit(1);
});
