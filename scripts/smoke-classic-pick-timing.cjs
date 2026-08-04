/**
 * Вне Next.js: connect + id-pool + resolve 10Q на Direct Neon.
 * Сравниваем с wall-clock budget в next dev.
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

async function runOnce(label) {
  const t0 = Date.now();
  const client = new Client({
    connectionString: normalize(url),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    family: 4,
  });

  const mark = (name) => {
    console.log(`${label}.${name}_ms`, Date.now() - t0);
  };

  await client.connect();
  mark('connect');

  const ids = await client.query(`
    SELECT q."id"
    FROM "Question" q
    WHERE
      q."difficulty" = 'EASY'::"Difficulty"
      AND q."isActive" = true
      AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
  `);
  mark('id_pool');
  console.log(`${label}.id_count`, ids.rowCount);

  const pick = ids.rows.slice(0, 10).map((r) => r.id);

  const resolve = await client.query(
    `
    WITH ordered_ids AS (
      SELECT id, ord::int - 1 AS pick_position
      FROM unnest($1::text[]) WITH ORDINALITY AS t(id, ord)
    )
    SELECT
      q."id" AS question_id,
      ao."id" AS option_id
    FROM ordered_ids oi
    INNER JOIN "Question" q ON q."id" = oi.id
    INNER JOIN "AnswerOption" ao ON ao."questionId" = q."id"
    ORDER BY oi.pick_position, ao."order" ASC
  `,
    [pick],
  );
  mark('resolve_simple');
  console.log(`${label}.resolve_rows`, resolve.rowCount);

  // fire-and-forget end like app
  void client.end().catch(() => undefined);
  mark('total_before_end');
}

(async () => {
  await runOnce('a');
  await new Promise((r) => setTimeout(r, 500));
  await runOnce('b');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
