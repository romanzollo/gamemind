const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const LOCALES = ['ru', 'en'];
const SHOULD_FIX = process.argv.includes('--fix');

// читаем переменные окружения из .env
function readEnv(name) {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const match = env.match(new RegExp(`${name}="([^"]+)"`));
    if (!match) throw new Error(`Missing ${name} in .env`);
    return match[1];
}

function normalizeConnectionString(connectionString) {
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

function createClient() {
    const client = new Client({
        connectionString: normalizeConnectionString(
            readEnv('DATABASE_URL_UNPOOLED'),
        ),
        connectionTimeoutMillis: 20000,
        keepAlive: true,
        ssl: { rejectUnauthorized: true },
    });

    client.on('error', (error) => {
        console.warn('pg client warning:', error.message);
    });

    return client;
}

const TRANSIENT_PG_ERRORS = [
    'ECONNRESET',
    'ETIMEDOUT',
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection ended unexpectedly',
    'not queryable',
];

function isTransientPgError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return TRANSIENT_PG_ERRORS.some((part) => message.includes(part));
}

async function withPgClient(run) {
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const client = createClient();

        try {
            await client.connect();
            return await run(client);
        } catch (error) {
            lastError = error;

            if (!isTransientPgError(error) || attempt === 3) {
                throw error;
            }

            console.warn(
                `Retrying database check (${attempt}/3): ${error.message}`,
            );
        } finally {
            await client.end().catch(() => undefined);
        }
    }

    throw lastError;
}

// выводим заголовок раздела
function printSection(title) {
    console.log(`\n=== ${title} ===`);
}

async function repairEmptyTranslations(client) {
    printSection('Repair empty translations');

    const questionFix = await client.query(`
        UPDATE "QuestionTranslation" qt
        SET "text" = COALESCE(
            NULLIF(BTRIM(fallback."text"), ''),
            NULLIF(BTRIM(q."text"), '')
        )
        FROM "Question" q
        LEFT JOIN "QuestionTranslation" fallback
            ON fallback."questionId" = q."id"
            AND fallback."locale" = 'ru'::"ContentLocale"
        WHERE
            qt."questionId" = q."id"
            AND BTRIM(qt."text") = ''
            AND COALESCE(
                NULLIF(BTRIM(fallback."text"), ''),
                NULLIF(BTRIM(q."text"), '')
            ) IS NOT NULL
        RETURNING qt."questionId", qt."locale"::text AS locale
    `);

    const optionFix = await client.query(`
        UPDATE "AnswerOptionTranslation" aot
        SET "text" = COALESCE(
            NULLIF(BTRIM(ru."text"), ''),
            NULLIF(BTRIM(ao."text"), '')
        )
        FROM "AnswerOption" ao
        LEFT JOIN "AnswerOptionTranslation" ru
            ON ru."optionId" = ao."id"
            AND ru."locale" = 'ru'::"ContentLocale"
        WHERE
            aot."optionId" = ao."id"
            AND BTRIM(aot."text") = ''
            AND COALESCE(
                NULLIF(BTRIM(ru."text"), ''),
                NULLIF(BTRIM(ao."text"), '')
            ) IS NOT NULL
        RETURNING aot."optionId", aot."locale"::text AS locale
    `);

    if (questionFix.rows.length === 0 && optionFix.rows.length === 0) {
        console.log('No empty translations to repair');
        return;
    }

    for (const row of questionFix.rows) {
        console.log(`Fixed question ${row.questionId} [${row.locale}]`);
    }

    for (const row of optionFix.rows) {
        console.log(`Fixed option ${row.optionId} [${row.locale}]`);
    }
}

// проверки схемы и целостности переводов
async function runCoreChecks(client) {
    let hasErrors = false;

    printSection('Schema');
    const tables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'QuestionTranslation',
            'AnswerOptionTranslation'
          )
        ORDER BY table_name
    `);

    if (tables.rows.length !== 2) {
        hasErrors = true;
        console.error('FAIL: translation tables are missing');
        console.error(
            'Found:',
            tables.rows.map((row) => row.table_name),
        );
    } else {
        console.log('OK: translation tables exist');
    }

    const sessionLocaleColumn = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'QuizSession'
          AND column_name = 'sessionLocale'
    `);

    if (sessionLocaleColumn.rows.length === 0) {
        hasErrors = true;
        console.error('FAIL: QuizSession.sessionLocale column is missing');
    } else {
        console.log('OK: QuizSession.sessionLocale exists');
    }

    printSection('Active questions — translations');
    const missingQuestionTranslations = await client.query(`
        SELECT
            q."id",
            q."difficulty"::text AS difficulty,
            ARRAY_AGG(DISTINCT qt."locale"::text) AS locales
        FROM "Question" q
        LEFT JOIN "QuestionTranslation" qt
            ON qt."questionId" = q."id"
        WHERE q."isActive" = true
        GROUP BY q."id", q."difficulty"
        HAVING COUNT(DISTINCT qt."locale") < 2
        ORDER BY q."id"
    `);

    if (missingQuestionTranslations.rows.length > 0) {
        hasErrors = true;
        console.error(
            `FAIL: ${missingQuestionTranslations.rows.length} active question(s) missing ru/en translations`,
        );
        for (const row of missingQuestionTranslations.rows) {
            console.error(
                `  - ${row.id} [${row.difficulty}] locales=${JSON.stringify(row.locales)}`,
            );
        }
    } else {
        console.log('OK: every active question has ru + en translations');
    }

    printSection('Answer options — translations');
    const missingOptionTranslations = await client.query(`
        SELECT
            ao."id",
            ao."questionId",
            ARRAY_AGG(DISTINCT aot."locale"::text) AS locales
        FROM "AnswerOption" ao
        INNER JOIN "Question" q
            ON q."id" = ao."questionId"
        LEFT JOIN "AnswerOptionTranslation" aot
            ON aot."optionId" = ao."id"
        WHERE q."isActive" = true
        GROUP BY ao."id", ao."questionId"
        HAVING COUNT(DISTINCT aot."locale") < 2
        ORDER BY ao."questionId", ao."id"
    `);

    if (missingOptionTranslations.rows.length > 0) {
        hasErrors = true;
        console.error(
            `FAIL: ${missingOptionTranslations.rows.length} option(s) missing ru/en translations`,
        );
        for (const row of missingOptionTranslations.rows.slice(0, 20)) {
            console.error(
                `  - option ${row.id} (question ${row.questionId}) locales=${JSON.stringify(row.locales)}`,
            );
        }
        if (missingOptionTranslations.rows.length > 20) {
            console.error('  ... truncated');
        }
    } else {
        console.log(
            'OK: every option of active questions has ru + en translations',
        );
    }

    printSection('Empty translation text');
    const emptyTexts = await client.query(`
        SELECT 'question' AS kind, qt."questionId" AS entity_id, qt."locale"::text AS locale
        FROM "QuestionTranslation" qt
        INNER JOIN "Question" q ON q."id" = qt."questionId"
        WHERE q."isActive" = true AND BTRIM(qt."text") = ''

        UNION ALL

        SELECT 'option' AS kind, aot."optionId" AS entity_id, aot."locale"::text AS locale
        FROM "AnswerOptionTranslation" aot
        INNER JOIN "AnswerOption" ao ON ao."id" = aot."optionId"
        INNER JOIN "Question" q ON q."id" = ao."questionId"
        WHERE q."isActive" = true AND BTRIM(aot."text") = ''
    `);

    if (emptyTexts.rows.length > 0) {
        hasErrors = true;
        console.error(
            `FAIL: ${emptyTexts.rows.length} empty translation row(s)`,
        );
        for (const row of emptyTexts.rows) {
            console.error(`  - ${row.kind} ${row.entity_id} [${row.locale}]`);
        }
        console.error(
            'Hint: run with --fix to backfill empty translations from ru/legacy text',
        );
    } else {
        console.log('OK: no empty translation texts');
    }

    return hasErrors;
}

async function runSummaryChecks(client) {
    printSection('Question bank summary');
    const summary = await client.query(`
        SELECT
            "difficulty"::text AS difficulty,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE "isActive" = true)::int AS active
        FROM "Question"
        GROUP BY "difficulty"
        ORDER BY "difficulty"
    `);

    for (const row of summary.rows) {
        console.log(
            `${row.difficulty}: total=${row.total}, active=${row.active}`,
        );
    }

    const activeTotal = summary.rows.reduce((sum, row) => sum + row.active, 0);

    if (activeTotal < 10) {
        console.warn(
            `WARN: only ${activeTotal} active questions — randomization will feel repetitive`,
        );
    }

    printSection('Sample texts for manual check');
    const samples = await client.query(`
        SELECT DISTINCT ON (qt."locale")
            qt."locale"::text AS locale,
            q."id",
            COALESCE(qt."text", q."text") AS text
        FROM "Question" q
        INNER JOIN "QuestionTranslation" qt
            ON qt."questionId" = q."id"
        WHERE q."isActive" = true
        ORDER BY qt."locale", q."createdAt" ASC
    `);

    for (const locale of LOCALES) {
        const row = samples.rows.find((item) => item.locale === locale);

        if (row) {
            console.log(`[${locale}] ${row.id}: ${row.text}`);
        } else {
            console.warn(`[${locale}] no active questions found`);
        }
    }
}

async function main() {
    if (SHOULD_FIX) {
        await withPgClient(repairEmptyTranslations);
    }

    const hasErrors = await withPgClient(runCoreChecks);

    try {
        await withPgClient(runSummaryChecks);
    } catch (error) {
        console.warn(
            'Summary section skipped due to transient DB connection issue:',
            error.message,
        );
    }

    printSection('Result');
    if (hasErrors) {
        console.error('VERIFY FAILED');
        process.exit(1);
    }

    console.log('VERIFY PASSED');
    console.log(
        'Next: manual browser check — start quiz on /en and /ru, confirm question text differs.',
    );
}

// запускаем главную функцию
main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
