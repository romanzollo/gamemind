/**
 * Снимает зачёт с «пустых» волн Survival, созданных ошибкой часов (Oct 2026).
 *
 * Что было: часы устройства спешили на ~2 с; после обрыва по банку сервер
 * видел остаток 1 с и предлагал «следующую волну», которая обрывалась сразу
 * — волны засчитывались, и ачивки «дойди до волны N» открывались зря.
 * Признак такой волны: волна 2+, 0 ответов, сдана быстрее 2 с после старта
 * банка (честно так не бывает: перед стартом пауза, без ответов волна
 * длится весь банк).
 *
 * Делает (одна транзакция на игрока):
 * - `survivalClockOk = false` для этих волн (очков у них 0 — сумма забега
 *   не меняется);
 * - удаляет ачивки SURVIVAL_WAVE_3/5/10, которые после этого не
 *   подтверждаются лучшей честной волной (та же выборка, что
 *   survival_best_wave в user-achievement.repository).
 *
 * Usage:
 *   node scripts/void-phantom-survival-waves.cjs --dry-run
 *   node scripts/void-phantom-survival-waves.cjs
 *   node scripts/void-phantom-survival-waves.cjs --target=prod --dry-run
 *   node scripts/void-phantom-survival-waves.cjs --target=prod
 *
 * Прод — только PROD_DATABASE_URL_UNPOOLED и только по команде владельца.
 * ADR: docs/DECISIONS.md → Survival clock — server time sync and wave start.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const PHANTOM_MAX_ELAPSED_SECONDS = 2;
/** Пороги из ACHIEVEMENT_CATALOG (src/features/achievements/types.ts). */
const WAVE_ACHIEVEMENTS = [
    { code: 'SURVIVAL_WAVE_3', threshold: 3 },
    { code: 'SURVIVAL_WAVE_5', threshold: 5 },
    { code: 'SURVIVAL_WAVE_10', threshold: 10 },
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

async function findPhantomWaves(client) {
    const { rows } = await client.query(
        `
        SELECT s.id, s."userId" AS user_id, usr.username, s."survivalWaveIndex" AS wave,
               EXTRACT(EPOCH FROM (s."completedAt" - s."startedAt"))::float AS elapsed
        FROM "QuizSession" s
        JOIN "User" usr ON usr.id = s."userId"
        WHERE s."survivalRunId" IS NOT NULL
          AND s.status = 'COMPLETED'::"QuizSessionStatus"
          AND s."survivalClockOk" IS TRUE
          AND s."survivalWaveIndex" > 1
          AND s."completedAt" - s."startedAt" < make_interval(secs => $1)
          AND NOT EXISTS (SELECT 1 FROM "QuizAnswer" a WHERE a."sessionId" = s.id)
        ORDER BY usr.username, s."completedAt"
        `,
        [PHANTOM_MAX_ELAPSED_SECONDS],
    );
    return rows;
}

/** Как survival_best_wave в user-achievement.repository, но без указанных волн. */
async function bestHonestWave(client, userId, excludeIds) {
    const { rows } = await client.query(
        `
        SELECT COALESCE(MAX(ws."survivalWaveIndex"), 0)::int AS best
        FROM "QuizSession" ws
        JOIN "QuizResult" wr ON wr."sessionId" = ws.id
        WHERE ws."userId" = $1
          AND ws."survivalRunId" IS NOT NULL
          AND ws."survivalClockOk" IS TRUE
          AND NOT (ws.id = ANY($2::text[]))
        `,
        [userId, excludeIds],
    );
    return rows[0].best;
}

async function unlockedWaveAchievements(client, userId) {
    const { rows } = await client.query(
        `SELECT code FROM "UserAchievement" WHERE "userId" = $1 AND code = ANY($2::text[])`,
        [userId, WAVE_ACHIEVEMENTS.map((a) => a.code)],
    );
    return new Set(rows.map((r) => r.code));
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
        console.log(`Phantom Survival waves (${args.target}${args.dryRun ? ', dry-run' : ''})`);
        console.log(`  host: ${hostnameOf(connectionString) || '(unknown)'}\n`);

        const phantoms = await findPhantomWaves(client);
        const byUser = new Map();
        for (const wave of phantoms) {
            if (!byUser.has(wave.user_id)) byUser.set(wave.user_id, { username: wave.username, waves: [] });
            byUser.get(wave.user_id).waves.push(wave);
        }

        for (const [userId, { username, waves }] of byUser) {
            const ids = waves.map((w) => w.id);
            const before = await bestHonestWave(client, userId, []);
            const after = await bestHonestWave(client, userId, ids);
            const unlocked = await unlockedWaveAchievements(client, userId);
            const revoke = WAVE_ACHIEVEMENTS.filter((a) => unlocked.has(a.code) && after < a.threshold).map((a) => a.code);

            console.log(`${username}: ${waves.length} phantom wave(s) ${waves.map((w) => `#${w.wave} ${w.elapsed.toFixed(2)}s`).join(', ')}`);
            console.log(`  best honest wave ${before} → ${after}; revoke: ${revoke.join(', ') || 'none'}`);

            if (args.dryRun) continue;

            await client.query('BEGIN');
            try {
                await client.query(
                    `UPDATE "QuizSession" SET "survivalClockOk" = false WHERE id = ANY($1::text[]) AND "survivalClockOk" IS TRUE`,
                    [ids],
                );
                if (revoke.length > 0) {
                    await client.query(
                        `DELETE FROM "UserAchievement" WHERE "userId" = $1 AND code = ANY($2::text[])`,
                        [userId, revoke],
                    );
                }
                await client.query('COMMIT');
                console.log('  OK');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => undefined);
                throw error;
            }
        }

        console.log(`\n${args.dryRun ? 'Would void' : 'Voided'}: ${phantoms.length} wave(s), ${byUser.size} player(s)`);
    } finally {
        await client.end().catch(() => undefined);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
