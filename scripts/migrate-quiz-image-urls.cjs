/**
 * Перевод ссылок на картинки IMAGE_GUESS в БД со slug-имён на имена-хеши
 * (по content/quiz-images.manifest.json).
 *
 * Где живут ссылки:
 * - QuestionAsset.url — источник для новых партий;
 * - QuizSession.snapshotData — замороженный набор вопросов партии (в т.ч.
 *   начатых: иначе игрок с открытой вкладкой увидит 404 после удаления
 *   старых файлов, а старое имя продолжит выдавать ответ);
 * - QuizResult.reviewPayload / reviewSnapshot — разбор прошлых партий.
 *
 * Инварианты:
 * - меняется только текст путей `/quiz-images/{folder}/{slug}.(webp|svg)`,
 *   структура JSON не трогается; повторный запуск ничего не меняет;
 * - строка JSONB обновляется, только если не изменилась с момента чтения
 *   (сравнение текста) — гонка с живой партией не затирает её запись;
 * - неизвестный slug не трогаем и считаем проблемой (exit 1);
 * - перед записью на prod проверяем, что все хеш-файлы уже отдаёт сайт:
 *   сначала деплой с новыми файлами, потом миграция, и только потом
 *   удаление старых (scripts/hash-quiz-images.cjs --prune-legacy).
 *
 * Usage:
 *   node scripts/migrate-quiz-image-urls.cjs --dry-run
 *   node scripts/migrate-quiz-image-urls.cjs
 *   node scripts/migrate-quiz-image-urls.cjs --target=prod --dry-run
 *   node scripts/migrate-quiz-image-urls.cjs --target=prod
 *
 * Прод — только PROD_DATABASE_URL_UNPOOLED и только по команде владельца.
 * ADR: docs/DECISIONS.md → Quiz answer leak — opaque play ids.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const {
    ANY_QUIZ_IMAGE_URL_RE,
    filePathForUrl,
    isHashedQuizImageUrl,
    logicalWebpUrl,
    readManifest,
} = require('./quiz-image-manifest.cjs');

const ROOT = path.join(__dirname, '..');
const PROD_ORIGIN = 'https://www.game-mind.ru';
const PAGE_SIZE = 25;

const JSON_COLUMNS = [
    { table: 'QuizSession', column: 'snapshotData' },
    { table: 'QuizResult', column: 'reviewPayload' },
    { table: 'QuizResult', column: 'reviewSnapshot' },
];

const TRANSIENT_PG_ERROR_MESSAGES = [
    'Connection terminated unexpectedly',
    'Connection terminated due to connection timeout',
    'Connection ended unexpectedly',
    'not queryable',
    'ECONNRESET',
    'ETIMEDOUT',
    'timeout exceeded when trying to connect',
];

function parseArgs(argv) {
    return {
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
            throw new Error('PROD_DATABASE_URL_UNPOOLED is required for --target=prod');
        }
        if (hostnameOf(url).includes('jolly-river')) {
            throw new Error(`Refusing --target=prod: host looks like local Neon (${hostnameOf(url)})`);
        }
        return url;
    }

    const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
    }
    if (hostnameOf(url).includes('red-mountain')) {
        throw new Error('Refusing local run against prod red-mountain host');
    }
    return url;
}

function isTransientPgError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return TRANSIENT_PG_ERROR_MESSAGES.some((part) => message.includes(part));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Свежий Client на каждый шаг + повтор при обрыве (Neon на Windows рвёт
 * долгие сессии). Шаги идемпотентны, поэтому повтор безопасен.
 * dry-run открывает read-only транзакции: запись невозможна даже по ошибке.
 */
async function withRetry(connectionString, readOnly, run, attempts = 4) {
    for (let attempt = 1; ; attempt += 1) {
        const client = new Client({
            connectionString,
            connectionTimeoutMillis: 20_000,
            ssl: { rejectUnauthorized: false },
            ...(readOnly ? { options: '-c default_transaction_read_only=on' } : {}),
        });
        client.on('error', () => undefined);
        try {
            await client.connect();
            return await run(client);
        } catch (error) {
            if (!isTransientPgError(error) || attempt >= attempts) throw error;
            console.warn(`  retry ${attempt}/${attempts - 1}: ${error.message}`);
            await sleep(1000 * attempt);
        } finally {
            await client.end().catch(() => undefined);
        }
    }
}

function buildUrlMap(manifest) {
    const map = new Map(Object.entries(manifest.images));
    if (map.size === 0) {
        throw new Error('Manifest is empty: run node scripts/hash-quiz-images.cjs first');
    }
    return map;
}

/** Хеш-файлы должны быть там, откуда их получит игрок, до записи в БД. */
async function assertHashedFilesServed(urls, target) {
    const missing = [];
    if (target === 'prod') {
        for (const url of urls) {
            const response = await fetch(`${PROD_ORIGIN}${url}`, { method: 'HEAD' });
            if (response.status !== 200) missing.push(`${url} → HTTP ${response.status}`);
        }
    } else {
        for (const url of urls) {
            if (!fs.existsSync(filePathForUrl(url))) missing.push(`${url} → no file in public/`);
        }
    }
    return missing;
}

function rewriteText(text, urlMap, unknown) {
    return text.replace(ANY_QUIZ_IMAGE_URL_RE, (match) => {
        if (isHashedQuizImageUrl(match)) return match;
        const next = urlMap.get(logicalWebpUrl(match));
        if (!next) {
            unknown.add(match);
            return match;
        }
        return next;
    });
}

async function migrateAssets(connectionString, urlMap, dryRun) {
    return withRetry(connectionString, dryRun, async (client) => {
        const { rows } = await client.query(
            `SELECT id, url FROM "QuestionAsset" WHERE url LIKE '/quiz-images/%'`,
        );
        const unknown = new Set();
        const ids = [];
        const urls = [];
        for (const row of rows) {
            const next = rewriteText(row.url, urlMap, unknown);
            if (next !== row.url) {
                ids.push(row.id);
                urls.push(next);
            }
        }

        let updated = 0;
        if (!dryRun && ids.length > 0) {
            const result = await client.query(
                `UPDATE "QuestionAsset" AS a
                 SET url = m.url
                 FROM unnest($1::text[], $2::text[]) AS m(id, url)
                 WHERE a.id = m.id`,
                [ids, urls],
            );
            updated = result.rowCount ?? 0;
        }

        return { scanned: rows.length, planned: ids.length, updated, unknown };
    });
}

async function migrateJsonColumn(connectionString, spec, urlMap, dryRun) {
    const { table, column } = spec;
    const totals = { scanned: 0, planned: 0, updated: 0, conflicts: 0, unknown: new Set() };
    let afterId = '';

    for (;;) {
        const page = await withRetry(connectionString, dryRun, async (client) => {
            const { rows } = await client.query(
                `SELECT id, "${column}"::text AS body
                 FROM "${table}"
                 WHERE id > $1 AND "${column}"::text LIKE '%/quiz-images/%'
                 ORDER BY id
                 LIMIT ${PAGE_SIZE}`,
                [afterId],
            );

            const ids = [];
            const bodies = [];
            const previous = [];
            for (const row of rows) {
                const next = rewriteText(row.body, urlMap, totals.unknown);
                if (next !== row.body) {
                    ids.push(row.id);
                    bodies.push(next);
                    previous.push(row.body);
                }
            }

            let updated = 0;
            if (!dryRun && ids.length > 0) {
                const result = await client.query(
                    `UPDATE "${table}" AS t
                     SET "${column}" = v.body::jsonb
                     FROM unnest($1::text[], $2::text[], $3::text[]) AS v(id, body, prev)
                     WHERE t.id = v.id AND t."${column}"::text = v.prev`,
                    [ids, bodies, previous],
                );
                updated = result.rowCount ?? 0;
            }

            return {
                scanned: rows.length,
                planned: ids.length,
                updated,
                lastId: rows.length > 0 ? rows[rows.length - 1].id : null,
            };
        });

        totals.scanned += page.scanned;
        totals.planned += page.planned;
        totals.updated += page.updated;
        if (!dryRun) totals.conflicts += page.planned - page.updated;
        if (page.scanned < PAGE_SIZE || !page.lastId) break;
        afterId = page.lastId;
    }

    return totals;
}

function printResult(label, result, dryRun) {
    const action = dryRun ? `would update ${result.planned}` : `updated ${result.updated}/${result.planned}`;
    const conflicts = result.conflicts ? `, changed meanwhile ${result.conflicts}` : '';
    console.log(`  ${label}: rows with /quiz-images/ ${result.scanned}, ${action}${conflicts}`);
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const env = { ...process.env };
    loadEnvFile('.env', env);
    loadEnvFile('.env.local', env);
    const connectionString = resolveConnectionString(args.target, env);
    const urlMap = buildUrlMap(readManifest());

    console.log(`Quiz image URLs (${args.target}${args.dryRun ? ', dry-run' : ''})`);
    console.log(`  host: ${hostnameOf(connectionString) || '(unknown)'}`);
    console.log(`  manifest: ${urlMap.size} images\n`);

    const missing = await assertHashedFilesServed(new Set(urlMap.values()), args.target);
    if (missing.length > 0) {
        for (const line of missing.slice(0, 10)) console.error(`  missing ${line}`);
        const message = `${missing.length} hashed file(s) are not served yet — deploy them before migrating`;
        if (!args.dryRun) throw new Error(message);
        console.error(`  ${message}\n`);
    }

    const results = [['QuestionAsset.url', await migrateAssets(connectionString, urlMap, args.dryRun)]];
    for (const spec of JSON_COLUMNS) {
        results.push([
            `${spec.table}.${spec.column}`,
            await migrateJsonColumn(connectionString, spec, urlMap, args.dryRun),
        ]);
    }

    const unknown = new Set();
    let pending = 0;
    for (const [label, result] of results) {
        printResult(label, result, args.dryRun);
        for (const url of result.unknown) unknown.add(url);
        pending += args.dryRun ? result.planned : result.planned - result.updated;
    }

    if (unknown.size > 0) {
        console.error(`\nUnknown image paths (not in manifest, left as is): ${unknown.size}`);
        for (const url of [...unknown].slice(0, 20)) console.error(`  ${url}`);
        process.exitCode = 1;
    }

    console.log(
        args.dryRun
            ? `\nDry-run: ${pending} row(s) still reference slug file names.`
            : `\nDone. Rows left behind: ${pending} (re-run --dry-run: expect 0 before --prune-legacy).`,
    );
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
