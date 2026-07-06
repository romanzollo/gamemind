const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function readEnv(name) {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const match = env.match(new RegExp(`${name}="([^"]+)"`));
    if (!match) throw new Error(`Missing ${name}`);
    return match[1];
}

const { questions } = require('./seed-questions.cjs');
const { ensurePlaceholders } = require('./generate-quiz-placeholders.cjs');

const TEST_QUESTION_IDS = [
    'q-test-write',
    'q-test-write-2',
    'q-test-write-3',
    'q-test-raw',
];

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

function isTransientPgError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return TRANSIENT_PG_ERROR_MESSAGES.some((part) => message.includes(part));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateQuestions(seedQuestions) {
    for (const question of seedQuestions) {
        const correctOptions = question.options.filter(
            (option) => option.isCorrect,
        );

        if (question.options.length < 2) {
            throw new Error(
                `Question "${question.id}" must have at least 2 options.`,
            );
        }

        if (correctOptions.length !== 1) {
            throw new Error(
                `Question "${question.id}" must have exactly one correct option.`,
            );
        }

        for (const locale of LOCALES) {
            if (!question.translations[locale]?.text) {
                throw new Error(
                    `Question "${question.id}" is missing ${locale} translation.`,
                );
            }

            for (const option of question.options) {
                if (!option.translations[locale]?.text) {
                    throw new Error(
                        `Question "${question.id}" option ${option.order} is missing ${locale} translation.`,
                    );
                }
            }
        }

        const questionType = question.type ?? 'TEXT';

        if (questionType === 'IMAGE_GUESS') {
            if (!question.promptImage?.url?.trim()) {
                throw new Error(
                    `Question "${question.id}" IMAGE_GUESS requires promptImage.url.`,
                );
            }
        } else if (questionType !== 'TEXT') {
            throw new Error(
                `Question "${question.id}" has unsupported type "${questionType}".`,
            );
        }
    }
}

function createClient() {
    const client = new Client({
        connectionString: readEnv('DATABASE_URL_UNPOOLED'),
        ssl: { rejectUnauthorized: true },
        keepAlive: true,
        connectionTimeoutMillis: 15_000,
    });

    client.on('error', (error) => {
        console.warn('Seed pg client error:', error.message);
    });

    return client;
}

async function withClient(run) {
    const client = createClient();
    await client.connect();

    try {
        return await run(client);
    } finally {
        await client.end();
    }
}

async function withRetry(run, { attempts = 3 } = {}) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await withClient(run);
        } catch (error) {
            lastError = error;

            if (!isTransientPgError(error) || attempt === attempts) {
                throw error;
            }

            console.warn(
                `Seed attempt ${attempt} failed (${error.message}), retrying...`,
            );
            await sleep(1000 * attempt);
        }
    }

    throw lastError;
}

async function cleanupTestQuestions(client) {
    if (TEST_QUESTION_IDS.length === 0) return;

    await client.query(
        'DELETE FROM "AnswerOption" WHERE "questionId" = ANY($1::text[])',
        [TEST_QUESTION_IDS],
    );
    await client.query('DELETE FROM "Question" WHERE id = ANY($1::text[])', [
        TEST_QUESTION_IDS,
    ]);
}

async function seedQuestion(client, question) {
    const ruText = question.translations.ru.text;
    const questionType = question.type ?? 'TEXT';

    await client.query(
        `INSERT INTO "Question" (
        id, text, type, difficulty, category, metadata, "isActive", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3::"QuestionType", $4::"Difficulty", $5, $6::jsonb, true, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        text = EXCLUDED.text,
        type = EXCLUDED.type,
        difficulty = EXCLUDED.difficulty,
        category = EXCLUDED.category,
        metadata = EXCLUDED.metadata,
        "isActive" = true,
        "updatedAt" = NOW()`,
        [
            question.id,
            ruText,
            questionType,
            question.difficulty,
            'video-games',
            JSON.stringify(question.metadata ?? null),
        ],
    );

    const questionTranslationValues = LOCALES.map(
        (_, index) =>
            `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}::"ContentLocale", $${index * 4 + 4})`,
    );
    const questionTranslationParams = LOCALES.flatMap((locale) => [
        `qt-${question.id}-${locale}`,
        question.id,
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

    for (const option of question.options) {
        const optionId = `${question.id}-opt-${option.order}`;
        const ruOptionText = option.translations.ru.text;

        optionValues.push(
            `($${optionParamIndex}, $${optionParamIndex + 1}, $${optionParamIndex + 2}, $${optionParamIndex + 3}, $${optionParamIndex + 4})`,
        );
        optionParams.push(
            optionId,
            question.id,
            ruOptionText,
            option.isCorrect,
            option.order,
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

    for (const option of question.options) {
        const optionId = `${question.id}-opt-${option.order}`;

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

    if (questionType === 'IMAGE_GUESS' && question.promptImage) {
        const assetId = `qa-${question.id}-prompt`;

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
                question.promptImage.mimeType ?? null,
                question.promptImage.width ?? null,
                question.promptImage.height ?? null,
            ],
        );
    } else {
        await client.query(
            `DELETE FROM "QuestionAsset"
             WHERE "questionId" = $1
               AND role = 'PROMPT'::"QuestionAssetRole"`,
            [question.id],
        );
    }
}

async function main() {
    validateQuestions(questions);
    ensurePlaceholders();

    await withRetry(async (client) => {
        await cleanupTestQuestions(client);
    });

    for (const question of questions) {
        await withRetry(
            async (client) => {
                await seedQuestion(client, question);
            },
            { attempts: 5 },
        );
        console.log(`Seeded ${question.id}`);
        await sleep(500);
    }

    const result = await withRetry(async (client) =>
        client.query('SELECT COUNT(*)::int AS count FROM "Question"'),
    );

    console.log(
        `Done. Seeded ${questions.length} questions. Total in DB: ${result.rows[0].count}.`,
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
