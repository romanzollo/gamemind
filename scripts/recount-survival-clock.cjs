/**
 * Пересчёт `survivalClockOk` прошлых волн Survival по правилу «последний
 * штраф мог списать только остаток банка» (Oct 30, 2026).
 *
 * Зачем: до правки неверный ответ при остатке банка < 6 с обнулял всю
 * волну (clockOk=false → очки не в забег и не в рейтинг). Скрипт находит
 * такие волны, ставит clockOk=true и добавляет очки волны в
 * `SurvivalRun.totalScore` — как сделал бы submit по новому правилу.
 *
 * Инварианты:
 * - формула — копия isSurvivalClockOk (src/features/survival-mode/lib):
 *   budget = max(0, T0 + 4×correct − 6×max(0, wrong − 1)), grace 3 с;
 * - T0 волны 1 = 20; волны k+1 — реконструкция по волне k без grace
 *   (как recordWaveAfterComplete писал `bankRemainingSeconds`);
 * - только false → true; одна волна = одна транзакция: флаг и totalScore
 *   вместе; повторный запуск ничего не меняет (флаг уже true);
 * - волны после правки уже судил новый submit той же формулой — для них
 *   false остаётся false (настоящее опоздание).
 *
 * Usage:
 *   node scripts/recount-survival-clock.cjs --dry-run
 *   node scripts/recount-survival-clock.cjs
 *   node scripts/recount-survival-clock.cjs --target=prod --dry-run
 *   node scripts/recount-survival-clock.cjs --target=prod
 *
 * Прод — только PROD_DATABASE_URL_UNPOOLED и только по команде владельца.
 * ADR: docs/DECISIONS.md → Survival clock — start delay and partial last penalty.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');

const RULES = {
    initialBankSeconds: 20,
    correctDeltaSeconds: 4,
    wrongDeltaSeconds: 6,
    graceSeconds: 3,
};

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

/** Копия isSurvivalClockOk (TS) — держать в синхроне. */
function isClockOk({ elapsedMs, correct, wrong, initialBankSeconds }) {
    const budgetSeconds =
        initialBankSeconds +
        RULES.correctDeltaSeconds * correct -
        RULES.wrongDeltaSeconds * Math.max(0, wrong - 1);
    const budgetMs = Math.max(0, budgetSeconds) * 1000;
    return Math.max(0, elapsedMs) <= budgetMs + RULES.graceSeconds * 1000;
}

/** Копия reconstructSurvivalBankRemainingSeconds (TS): полный штраф, без grace. */
function reconstructBankSeconds({ elapsedMs, correct, wrong, initialBankSeconds }) {
    const budgetSeconds =
        initialBankSeconds +
        RULES.correctDeltaSeconds * correct -
        RULES.wrongDeltaSeconds * wrong;
    const budgetMs = Math.max(0, budgetSeconds) * 1000;
    return Math.floor(Math.max(0, budgetMs - Math.max(0, elapsedMs)) / 1000);
}

async function loadWaves(client) {
    const { rows } = await client.query(`
        SELECT
            s.id,
            s."survivalRunId" AS run_id,
            s."survivalWaveIndex" AS wave,
            s."survivalClockOk" AS clock_ok,
            s."startedAt" AS started_at,
            s."completedAt" AS completed_at,
            usr.username,
            COALESCE(res.score, 0)::int AS score,
            COUNT(a.id)::int AS answered,
            COUNT(a.id) FILTER (WHERE a."isCorrect")::int AS correct
        FROM "QuizSession" s
        JOIN "User" usr ON usr.id = s."userId"
        LEFT JOIN "QuizResult" res ON res."sessionId" = s.id
        LEFT JOIN "QuizAnswer" a ON a."sessionId" = s.id
        WHERE s."survivalRunId" IS NOT NULL
          AND s.status = 'COMPLETED'::"QuizSessionStatus"
          AND s."completedAt" IS NOT NULL
        GROUP BY s.id, usr.username, res.score
        ORDER BY s."survivalRunId", s."survivalWaveIndex"
    `);
    return rows;
}

function planFlips(rows) {
    const byRun = new Map();
    for (const row of rows) {
        if (!byRun.has(row.run_id)) byRun.set(row.run_id, []);
        byRun.get(row.run_id).push(row);
    }

    const flips = [];
    for (const waves of byRun.values()) {
        let initialBankSeconds = RULES.initialBankSeconds;
        for (const wave of waves) {
            const elapsedMs = new Date(wave.completed_at) - new Date(wave.started_at);
            const correct = wave.correct;
            const wrong = wave.answered - wave.correct;
            const facts = { elapsedMs, correct, wrong, initialBankSeconds };

            if (wave.clock_ok === false && isClockOk(facts)) {
                flips.push({ ...wave, elapsedSeconds: elapsedMs / 1000, wrong, initialBankSeconds });
            }
            initialBankSeconds = reconstructBankSeconds(facts);
        }
    }
    return flips;
}

async function applyFlip(client, flip) {
    await client.query('BEGIN');
    try {
        const updated = await client.query(
            `UPDATE "QuizSession" SET "survivalClockOk" = true
             WHERE id = $1 AND "survivalClockOk" = false`,
            [flip.id],
        );
        if ((updated.rowCount ?? 0) === 1 && flip.score > 0) {
            await client.query(
                `UPDATE "SurvivalRun" SET "totalScore" = "totalScore" + $2 WHERE id = $1`,
                [flip.run_id, flip.score],
            );
        }
        await client.query('COMMIT');
        return (updated.rowCount ?? 0) === 1;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const env = { ...process.env };
    loadEnvFile('.env', env);
    loadEnvFile('.env.local', env);
    const connectionString = resolveConnectionString(args.target, env);

    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 20_000,
        ssl: { rejectUnauthorized: false },
        ...(args.dryRun ? { options: '-c default_transaction_read_only=on' } : {}),
    });
    client.on('error', () => undefined);
    await client.connect();

    try {
        console.log(`Survival clock recount (${args.target}${args.dryRun ? ', dry-run' : ''})`);
        console.log(`  host: ${hostnameOf(connectionString) || '(unknown)'}\n`);

        const rows = await loadWaves(client);
        const flips = planFlips(rows);
        const zeroed = rows.filter((row) => row.clock_ok === false).length;

        let applied = 0;
        for (const flip of flips) {
            const line = `${flip.username} wave ${flip.wave}: ${flip.answered} answered, ${flip.wrong} wrong, T0 ${flip.initialBankSeconds}s, elapsed ${flip.elapsedSeconds.toFixed(1)}s → +${flip.score} to run`;
            if (args.dryRun) {
                console.log(`  WOULD ${line}`);
            } else if (await applyFlip(client, flip)) {
                applied += 1;
                console.log(`  OK    ${line}`);
            }
        }

        const points = flips.reduce((sum, flip) => sum + flip.score, 0);
        console.log(`\nWaves with clockOk=false: ${zeroed}`);
        console.log(
            args.dryRun
                ? `Would count: ${flips.length} wave(s), +${points} run points`
                : `Counted: ${applied}/${flips.length} wave(s), +${points} run points`,
        );
    } finally {
        await client.end().catch(() => undefined);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
