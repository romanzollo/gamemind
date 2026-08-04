/**
 * Вне Next.js: EXPLAIN + тайминг result-read SQL (как quiz.result.load).
 * Цель: отделить медленный план / TOAST от wedge TLS внутри next dev.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        let val = m[2].trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
    }
}

loadEnv();

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL_UNPOOLED or DATABASE_URL required');
    process.exit(1);
}

function normalize(cs) {
    try {
        const u = new URL(cs);
        u.searchParams.delete('sslmode');
        return u.toString();
    } catch {
        return cs;
    }
}

function endClient(client) {
    // Success path: end without socket.destroy — mirrors the Direct teardown fix.
    void client.end().catch(() => undefined);
}

async function withClient(fn) {
    const client = new Client({
        connectionString: normalize(url),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10_000,
        family: 4,
    });
    client.on('error', () => undefined);
    const t0 = Date.now();
    await client.connect();
    const connectMs = Date.now() - t0;
    try {
        const result = await fn(client);
        return { connectMs, ...result };
    } finally {
        endClient(client);
    }
}

const RESULT_SQL = `
    SELECT
        r."id",
        r."sessionId" AS "session_id",
        r."userId" AS "user_id",
        r."score",
        r."totalQuestions" AS "total_questions",
        r."correctCount" AS "correct_count",
        r."completedAt" AS "completed_at",
        s."snapshotData" AS "snapshot_data",
        s."questionCount" AS "question_count",
        s."timedEndsAt" AS "timed_ends_at",
        s."difficulty"::text AS "difficulty"
    FROM "QuizResult" r
    INNER JOIN "QuizSession" s
        ON s."id" = r."sessionId"
    WHERE r."sessionId" = $1 AND r."userId" = $2
    LIMIT 1
`;

const ANSWERS_SQL = `
    SELECT
        "questionId" AS "question_id",
        "selectedOptionId" AS "selected_option_id",
        "isCorrect" AS "is_correct"
    FROM "QuizAnswer"
    WHERE "sessionId" = $1
`;

async function main() {
    const found = await withClient(async (client) => {
        const result = await client.query(`
            SELECT
                r."sessionId" AS "session_id",
                r."userId" AS "user_id",
                octet_length(s."snapshotData"::text) AS snap_bytes,
                s."questionCount" AS question_count
            FROM "QuizResult" r
            INNER JOIN "QuizSession" s ON s."id" = r."sessionId"
            ORDER BY r."completedAt" DESC
            LIMIT 1
        `);
        return { row: result.rows[0] ?? null };
    });

    console.log('latest_result', {
        connectMs: found.connectMs,
        sessionId: found.row?.session_id,
        snapBytes: found.row?.snap_bytes,
        questionCount: found.row?.question_count,
    });

    if (!found.row) {
        console.log('no QuizResult rows');
        return;
    }

    const sessionId = found.row.session_id;
    const userId = found.row.user_id;

    const explained = await withClient(async (client) => {
        const t1 = Date.now();
        const plan1 = await client.query(
            `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${RESULT_SQL}`,
            [sessionId, userId],
        );
        const q1Ms = Date.now() - t1;

        const t2 = Date.now();
        const plan2 = await client.query(
            `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${ANSWERS_SQL}`,
            [sessionId],
        );
        const q2Ms = Date.now() - t2;

        return {
            q1Ms,
            q2Ms,
            plan1: plan1.rows.map((row) => row['QUERY PLAN']),
            plan2: plan2.rows.map((row) => row['QUERY PLAN']),
        };
    });

    console.log('explain', {
        connectMs: explained.connectMs,
        q1Ms: explained.q1Ms,
        q2Ms: explained.q2Ms,
    });
    console.log('PLAN1\n' + explained.plan1.join('\n'));
    console.log('PLAN2\n' + explained.plan2.join('\n'));

    for (let i = 1; i <= 3; i += 1) {
        const run = await withClient(async (client) => {
            const t1 = Date.now();
            const result = await client.query(RESULT_SQL, [sessionId, userId]);
            const q1Ms = Date.now() - t1;

            const t2 = Date.now();
            const answers = await client.query(ANSWERS_SQL, [sessionId]);
            const q2Ms = Date.now() - t2;

            return {
                q1Ms,
                q2Ms,
                answerCount: answers.rowCount,
                hasSnapshot: result.rows[0]?.snapshot_data != null,
            };
        });

        console.log('run', i, {
            connectMs: run.connectMs,
            q1Ms: run.q1Ms,
            q2Ms: run.q2Ms,
            answerCount: run.answerCount,
            hasSnapshot: run.hasSnapshot,
        });

        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Simulate submit→result with graceful end (no socket.destroy).
    console.log('simulate_submit_then_result_graceful_end');
    const writeClient = new Client({
        connectionString: normalize(url),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10_000,
        family: 4,
    });
    writeClient.on('error', () => undefined);
    const tw0 = Date.now();
    await writeClient.connect();
    await writeClient.query('SELECT 1');
    endClient(writeClient);
    console.log('write_hop_ms', Date.now() - tw0);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const afterWrite = await withClient(async (client) => {
        const t1 = Date.now();
        await client.query(RESULT_SQL, [sessionId, userId]);
        const q1Ms = Date.now() - t1;
        const t2 = Date.now();
        await client.query(ANSWERS_SQL, [sessionId]);
        const q2Ms = Date.now() - t2;
        return { q1Ms, q2Ms };
    });
    console.log('after_write_result', {
        connectMs: afterWrite.connectMs,
        q1Ms: afterWrite.q1Ms,
        q2Ms: afterWrite.q2Ms,
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
