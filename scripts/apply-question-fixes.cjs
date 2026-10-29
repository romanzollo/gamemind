/**
 * Точечные правки уже опубликованных TEXT-вопросов из файла content/fixes/*.json.
 *
 * Зачем: аудит банка (формулировки, варианты, имена RU/EN) нужно применить
 * одинаково к dev и прод Neon. Реимпорт запрещён — он вставляет новые UUID
 * и дублирует пул (docs/CONTENT_PIPELINE.md §6). Здесь только UPDATE на месте.
 *
 * Инварианты:
 * - id вопроса и вариантов, isCorrect, порядок, publicationStatus, isActive
 *   не меняются — старые QuizAnswer остаются верными/неверными как были;
 * - вопрос ищется по сложности + четырём текущим RU-вариантам (id в dev и
 *   прод разные, draftKey в БД не хранится); если не нашёлся — по вариантам
 *   «после правки», это значит, что файл уже применён. Одинаковые наборы
 *   встречаются (две «консольные» HARD с Saturn/PS/N64/Dreamcast), поэтому
 *   совпадение всегда сужаем по RU-тексту вопроса (matchQuestionRu или уже
 *   новый question.ru) — иначе можно записать правку в чужой вопрос;
 * - найден по вариантам «до» → варианты сопоставляются по fromRu; найден по
 *   вариантам «после» → по новым ru и только сверяются. Без этого повторный
 *   запуск цепочки «Скайрим → Сиродил, Сиродил → Хай Рок» переименовал бы
 *   уже новый верный «Сиродил» ещё раз;
 * - legacy `Question.text` / `AnswerOption.text` держим равными RU, как import;
 * - один вопрос = одна транзакция: половинчатой правки не бывает;
 * - уже начатые партии и разбор ответов читают замороженный снапшот,
 *   новые тексты видны только в новых партиях.
 *
 * Usage:
 *   node scripts/apply-question-fixes.cjs <file.json> --dry-run
 *   node scripts/apply-question-fixes.cjs <file.json>
 *   node scripts/apply-question-fixes.cjs <file.json> --target=prod --dry-run
 *   node scripts/apply-question-fixes.cjs <file.json> --target=prod
 *
 * Прод — только PROD_DATABASE_URL_UNPOOLED и только по команде владельца.
 * Canon: docs/QUESTION_I18N.md §10.4; docs/CONTENT_PIPELINE.md §10.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');

/** Те же границы, что у админки и валидатора черновиков. */
const LIMITS = { questionMin: 10, questionMax: 500, optionMax: 200 };
const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);

function parseArgs(argv) {
    const file = argv.find((arg) => !arg.startsWith('--'));
    return {
        file,
        dryRun: argv.includes('--dry-run'),
        target: argv.includes('--target=prod') ? 'prod' : 'local',
    };
}

function loadEnvFile(fileName, env) {
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
        if (!(key in env)) env[key] = value;
    }
}

function hostnameOf(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

function resolveConnectionString(target, env) {
    if (target === 'prod') {
        const url = env.PROD_DATABASE_URL_UNPOOLED;
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

    const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
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

function isFilledString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function hasDuplicates(values) {
    const normalized = values.map((value) => value.trim().toLowerCase());
    return new Set(normalized).size !== normalized.length;
}

function sameSet(left, right) {
    const set = new Set(left);
    return left.length === right.length && right.every((value) => set.has(value));
}

/**
 * Проверяет файл целиком до первого запроса к БД: битая запись не должна
 * применить половину файла. Возвращает fix + вычисленный afterRu.
 */
function loadFixes(file) {
    const abs = path.resolve(ROOT, file);
    const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const errors = [];

    if (data.version !== 1) errors.push('version must be 1');
    if (!Array.isArray(data.fixes) || data.fixes.length === 0) {
        errors.push('fixes must be a non-empty array');
    }

    const keys = new Set();
    const fixes = [];

    for (const [index, fix] of (data.fixes ?? []).entries()) {
        const where = fix?.key ?? `#${index}`;
        const fail = (message) => errors.push(`${where}: ${message}`);

        if (!isFilledString(fix.key)) fail('key is required');
        else if (keys.has(fix.key)) fail('duplicate key');
        else keys.add(fix.key);

        if (!DIFFICULTIES.has(fix.difficulty)) fail('bad difficulty');

        const matchRu = fix.matchRu;
        if (
            !Array.isArray(matchRu) ||
            matchRu.length !== 4 ||
            !matchRu.every(isFilledString)
        ) {
            fail('matchRu must be 4 non-empty strings');
            continue;
        }

        if (!isFilledString(fix.matchQuestionRu)) {
            fail('matchQuestionRu is required');
        }

        if (!fix.question && !fix.options) fail('nothing to change');

        if (fix.question) {
            for (const locale of ['ru', 'en']) {
                const text = fix.question[locale];
                if (!isFilledString(text)) {
                    fail(`question.${locale} is required`);
                } else if (
                    text.length < LIMITS.questionMin ||
                    text.length > LIMITS.questionMax
                ) {
                    fail(`question.${locale} length ${text.length}`);
                }
            }
        }

        const afterRu = [...matchRu];
        const seenFrom = new Set();
        for (const option of fix.options ?? []) {
            if (!matchRu.includes(option.fromRu)) {
                fail(`fromRu not in matchRu: ${option.fromRu}`);
                continue;
            }
            if (seenFrom.has(option.fromRu)) {
                fail(`fromRu repeated: ${option.fromRu}`);
                continue;
            }
            seenFrom.add(option.fromRu);
            for (const locale of ['ru', 'en']) {
                const text = option[locale];
                if (!isFilledString(text)) {
                    fail(`option ${option.fromRu}: ${locale} is required`);
                } else if (text.length > LIMITS.optionMax) {
                    fail(`option ${option.fromRu}: ${locale} too long`);
                }
            }
            afterRu[matchRu.indexOf(option.fromRu)] = option.ru;
        }

        if (hasDuplicates(afterRu)) fail('RU options collide after fix');

        // Перестановка текстов внутри того же набора неотличима от «уже
        // применено»: повторный запуск переставил бы обратно. Делить на две правки.
        const renames = (fix.options ?? []).some((option) => option.ru !== option.fromRu);
        if (renames && sameSet(matchRu, afterRu)) {
            fail('option renames only permute the set; split into two fixes');
        }

        fixes.push({ ...fix, afterRu });
    }

    if (errors.length > 0) {
        throw new Error(`Invalid fixes file ${file}:\n  ${errors.join('\n  ')}`);
    }

    return fixes;
}

async function findQuestionIds(client, optionRu, difficulty) {
    const result = await client.query(
        `
        SELECT q.id
        FROM "Question" q
        WHERE q."type" = 'TEXT'::"QuestionType"
          AND q.difficulty = $2::"Difficulty"
          AND (
            SELECT COUNT(*)
            FROM "AnswerOption" ao
            INNER JOIN "AnswerOptionTranslation" aot
                ON aot."optionId" = ao.id
               AND aot.locale = 'ru'::"ContentLocale"
            WHERE ao."questionId" = q.id
              AND aot.text = ANY($1::text[])
          ) = 4
        `,
        [optionRu, difficulty],
    );
    return result.rows.map((row) => row.id);
}

/** Сужает совпадения по набору вариантов до вопроса с нужным RU-текстом. */
async function narrowByStem(client, ids, stems) {
    const result = await client.query(
        `
        SELECT "questionId" AS id
        FROM "QuestionTranslation"
        WHERE "questionId" = ANY($1::text[])
          AND locale = 'ru'::"ContentLocale"
          AND text = ANY($2::text[])
        `,
        [ids, stems],
    );
    return result.rows.map((row) => row.id);
}

async function loadQuestionState(client, id) {
    const question = await client.query(
        `
        SELECT
            q.text AS legacy,
            ru.text AS ru,
            en.text AS en
        FROM "Question" q
        LEFT JOIN "QuestionTranslation" ru
            ON ru."questionId" = q.id AND ru.locale = 'ru'::"ContentLocale"
        LEFT JOIN "QuestionTranslation" en
            ON en."questionId" = q.id AND en.locale = 'en'::"ContentLocale"
        WHERE q.id = $1
        `,
        [id],
    );
    const options = await client.query(
        `
        SELECT
            ao.id,
            ao.text AS legacy,
            ru.text AS ru,
            en.text AS en
        FROM "AnswerOption" ao
        LEFT JOIN "AnswerOptionTranslation" ru
            ON ru."optionId" = ao.id AND ru.locale = 'ru'::"ContentLocale"
        LEFT JOIN "AnswerOptionTranslation" en
            ON en."optionId" = ao.id AND en.locale = 'en'::"ContentLocale"
        WHERE ao."questionId" = $1
        ORDER BY ao."order"
        `,
        [id],
    );
    return { ...question.rows[0], options: options.rows };
}

/**
 * Сравнивает желаемое с тем, что лежит в БД. Пустой план = уже применено.
 *
 * phase 'before' (вопрос найден по matchRu): варианты ищем по fromRu, все
 * сразу, до записи — в одной правке верный «Скайрим» может стать «Сиродилом»,
 * а неверный «Сиродил» — «Хай Роком».
 * phase 'after' (найден по afterRu): правка уже была; ищем по новому ru
 * (afterRu без дублей) и лишь досинхронизируем en / legacy, если разошлись.
 */
function planFix(fix, state, phase) {
    const plan = { question: null, options: [], problems: [] };

    if (fix.question) {
        const { ru, en } = fix.question;
        if (state.ru !== ru || state.en !== en || state.legacy !== ru) {
            plan.question = { from: state.ru, ru, en };
        }
    }

    for (const edit of fix.options ?? []) {
        const lookup = phase === 'after' ? edit.ru : edit.fromRu;
        const current = state.options.find((option) => option.ru === lookup);
        if (!current) {
            plan.problems.push(`option not found (${phase}): ${lookup}`);
            continue;
        }
        if (
            current.ru !== edit.ru ||
            current.en !== edit.en ||
            current.legacy !== edit.ru
        ) {
            plan.options.push({
                id: current.id,
                fromRu: current.ru,
                fromEn: current.en,
                ru: edit.ru,
                en: edit.en,
            });
        }
    }

    const finalEn = state.options.map((option) => {
        const change = plan.options.find((item) => item.id === option.id);
        return change ? change.en : option.en;
    });
    if (hasDuplicates(finalEn)) plan.problems.push('EN options collide after fix');

    return plan;
}

async function updateExactlyOne(client, sql, params, label) {
    const result = await client.query(sql, params);
    if (result.rowCount !== 1) {
        throw new Error(`${label}: expected 1 row, got ${result.rowCount}`);
    }
}

async function applyPlan(client, questionId, plan) {
    await client.query('BEGIN');
    try {
        if (plan.question) {
            await updateExactlyOne(
                client,
                `UPDATE "Question" SET text = $2, "updatedAt" = NOW() WHERE id = $1`,
                [questionId, plan.question.ru],
                'Question',
            );
            for (const locale of ['ru', 'en']) {
                await updateExactlyOne(
                    client,
                    `
                    UPDATE "QuestionTranslation"
                    SET text = $3
                    WHERE "questionId" = $1 AND locale = $2::"ContentLocale"
                    `,
                    [questionId, locale, plan.question[locale]],
                    `QuestionTranslation.${locale}`,
                );
            }
        } else {
            // Варианты — часть контента вопроса: двигаем updatedAt и для них.
            await updateExactlyOne(
                client,
                `UPDATE "Question" SET "updatedAt" = NOW() WHERE id = $1`,
                [questionId],
                'Question.updatedAt',
            );
        }

        for (const option of plan.options) {
            await updateExactlyOne(
                client,
                `UPDATE "AnswerOption" SET text = $2 WHERE id = $1`,
                [option.id, option.ru],
                'AnswerOption',
            );
            for (const locale of ['ru', 'en']) {
                await updateExactlyOne(
                    client,
                    `
                    UPDATE "AnswerOptionTranslation"
                    SET text = $3
                    WHERE "optionId" = $1 AND locale = $2::"ContentLocale"
                    `,
                    [option.id, locale, option[locale]],
                    `AnswerOptionTranslation.${locale}`,
                );
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
}

function printPlan(plan) {
    if (plan.question) {
        console.log(`  q ru: ${plan.question.from}`);
        console.log(`     → ${plan.question.ru}`);
        console.log(`  q en: → ${plan.question.en}`);
    }
    for (const option of plan.options) {
        console.log(`  opt: ${option.fromRu} / ${option.fromEn}`);
        console.log(`     → ${option.ru} / ${option.en}`);
    }
}

async function findForPhase(client, fix, optionRu) {
    const ids = await findQuestionIds(client, optionRu, fix.difficulty);
    if (ids.length === 0) return ids;
    const stems = [fix.matchQuestionRu, fix.question?.ru].filter(Boolean);
    return narrowByStem(client, ids, stems);
}

async function processFix(connectionString, fix, dryRun) {
    return withFreshClient(connectionString, async (client) => {
        let phase = 'before';
        let ids = await findForPhase(client, fix, fix.matchRu);
        if (ids.length === 0 && !sameSet(fix.matchRu, fix.afterRu)) {
            phase = 'after';
            ids = await findForPhase(client, fix, fix.afterRu);
        }
        if (ids.length === 0) return { status: 'missing' };
        if (ids.length > 1) return { status: 'duplicate', count: ids.length };

        const [id] = ids;
        const state = await loadQuestionState(client, id);
        const plan = planFix(fix, state, phase);

        if (plan.problems.length > 0) {
            return { status: 'problem', id, problems: plan.problems };
        }
        if (!plan.question && plan.options.length === 0) {
            return { status: 'same', id };
        }
        if (!dryRun) await applyPlan(client, id, plan);
        return { status: dryRun ? 'would' : 'updated', id, plan };
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.file) {
        console.error(
            'Usage: node scripts/apply-question-fixes.cjs <file.json> [--dry-run] [--target=prod]',
        );
        process.exit(1);
    }

    const fixes = loadFixes(args.file);
    const env = { ...process.env };
    loadEnvFile('.env', env);
    loadEnvFile('.env.local', env);
    const connectionString = resolveConnectionString(args.target, env);

    console.log(
        `Question fixes (${args.target}${args.dryRun ? ', dry-run' : ''})`,
    );
    console.log(`  host: ${hostnameOf(connectionString) || '(unknown)'}`);
    console.log(`  file: ${args.file} (${fixes.length} fixes)\n`);

    const counts = {
        would: 0,
        updated: 0,
        same: 0,
        missing: 0,
        duplicate: 0,
        problem: 0,
        error: 0,
    };

    for (const fix of fixes) {
        let result;
        try {
            result = await processFix(connectionString, fix, args.dryRun);
        } catch (error) {
            result = { status: 'error', message: error.message };
        }
        counts[result.status] += 1;

        const tag = result.id ? ` ${result.id.slice(0, 8)}…` : '';
        if (result.status === 'would' || result.status === 'updated') {
            console.log(`${result.status === 'would' ? 'WOULD' : 'OK'} ${fix.key}${tag}`);
            printPlan(result.plan);
        } else if (result.status === 'missing') {
            console.error(`MISS ${fix.key}`);
        } else if (result.status === 'duplicate') {
            console.error(`DUP ${fix.key}: ${result.count} rows, skipped`);
        } else if (result.status === 'problem') {
            console.error(`PROBLEM ${fix.key}${tag}: ${result.problems.join('; ')}`);
        } else if (result.status === 'error') {
            console.error(`ERROR ${fix.key}: ${result.message}`);
        }
    }

    console.log('\nSummary:');
    console.log(`  fixes in file: ${fixes.length}`);
    console.log(`  ${args.dryRun ? 'would update' : 'updated'}: ${args.dryRun ? counts.would : counts.updated}`);
    console.log(`  already applied: ${counts.same}`);
    console.log(`  missing: ${counts.missing}`);
    console.log(`  duplicate fingerprints: ${counts.duplicate}`);
    console.log(`  problems: ${counts.problem}`);
    console.log(`  errors: ${counts.error}`);

    if (counts.missing + counts.duplicate + counts.problem + counts.error > 0) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { loadFixes, planFix };
