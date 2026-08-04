const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
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

function normalize(cs) {
    try {
        const u = new URL(cs);
        u.searchParams.delete('sslmode');
        return u.toString();
    } catch {
        return cs;
    }
}

async function main() {
    const id = process.argv[2] || 'c2df4b4f-e15c-4827-a8e1-44f4fab68ccc';
    const client = new Client({
        connectionString: normalize(
            process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
        ),
        ssl: { rejectUnauthorized: false },
        family: 4,
        connectionTimeoutMillis: 15_000,
    });
    client.on('error', () => undefined);
    await client.connect();

    const result = await client.query(
        `
        SELECT
            id,
            "userId",
            status::text,
            "questionCount",
            "snapshotData"
        FROM "QuizSession"
        WHERE id = $1
        `,
        [id],
    );
    const row = result.rows[0];
    if (!row) {
        console.log('missing');
        await client.end();
        return;
    }

    const snap = row.snapshotData;
    console.log({
        id: row.id,
        userId: row.userId,
        status: row.status,
        questionCount: row.questionCount,
        snapType: typeof snap,
        version: snap?.version,
        questionsLen: Array.isArray(snap?.questions)
            ? snap.questions.length
            : null,
        firstQuestionKeys: snap?.questions?.[0]
            ? Object.keys(snap.questions[0])
            : null,
        firstOptionKeys: snap?.questions?.[0]?.options?.[0]
            ? Object.keys(snap.questions[0].options[0])
            : null,
    });

    // Mimic page read filters
    const pageRead = await client.query(
        `
        SELECT
            "id" AS "session_id",
            "questionCount" AS "question_count",
            "snapshotData" AS "snapshot_data",
            "timedEndsAt" AS "timed_ends_at",
            "difficulty"::text AS "difficulty"
        FROM "QuizSession"
        WHERE
            "id" = $1
            AND "userId" = $2
            AND "status" = 'IN_PROGRESS'::"QuizSessionStatus"
        `,
        [id, row.userId],
    );
    console.log('page_read_rows', pageRead.rowCount);

    await client.end();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
