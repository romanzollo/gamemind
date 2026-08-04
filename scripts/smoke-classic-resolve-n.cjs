/**
 * Полный resolve SQL как в question-quiz-pick (без LATERAL asset — упрощённо
 * сравниваем 3 vs 10 row fan-out + bilingual joins).
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

function normalize(cs) {
  try {
    const u = new URL(cs);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return cs;
  }
}

const PROMPT_IMAGE_LATERAL = `
    LEFT JOIN LATERAL (
        SELECT qa."url"
        FROM "QuestionAsset" qa
        WHERE
            qa."questionId" = q."id"
            AND qa."role" = 'PROMPT'::"QuestionAssetRole"
        ORDER BY qa."order" ASC, qa."id" ASC
        LIMIT 1
    ) prompt_asset ON TRUE
`;

const BILINGUAL_Q = `
    LEFT JOIN "QuestionTranslation" qt_ru
        ON qt_ru."questionId" = q."id" AND qt_ru."locale" = 'ru'::"ContentLocale"
    LEFT JOIN "QuestionTranslation" qt_en
        ON qt_en."questionId" = q."id" AND qt_en."locale" = 'en'::"ContentLocale"
`;

const BILINGUAL_O = `
    LEFT JOIN "AnswerOptionTranslation" aot_ru
        ON aot_ru."optionId" = ao."id" AND aot_ru."locale" = 'ru'::"ContentLocale"
    LEFT JOIN "AnswerOptionTranslation" aot_en
        ON aot_en."optionId" = ao."id" AND aot_en."locale" = 'en'::"ContentLocale"
`;

async function resolveN(client, ids, label) {
  const t0 = Date.now();
  const result = await client.query(
    `
    WITH ordered_ids AS (
      SELECT id, ord::int - 1 AS pick_position
      FROM unnest($1::text[]) WITH ORDINALITY AS t(id, ord)
    )
    SELECT
      q."id" AS question_id,
      q."difficulty"::text AS difficulty,
      q."type"::text AS question_type,
      COALESCE(qt_ru."text", q."text") AS question_text_ru,
      COALESCE(qt_en."text", qt_ru."text", q."text") AS question_text_en,
      prompt_asset."url" AS prompt_image_url,
      ao."id" AS option_id,
      COALESCE(aot_ru."text", ao."text") AS option_text_ru,
      COALESCE(aot_en."text", aot_ru."text", ao."text") AS option_text_en,
      ao."isCorrect" AS is_correct
    FROM ordered_ids oi
    INNER JOIN "Question" q ON q."id" = oi.id
    ${PROMPT_IMAGE_LATERAL}
    INNER JOIN "AnswerOption" ao ON ao."questionId" = q."id"
    ${BILINGUAL_Q}
    ${BILINGUAL_O}
    ORDER BY oi.pick_position, ao."order" ASC
  `,
    [ids],
  );
  console.log(label, {
    ms: Date.now() - t0,
    rows: result.rowCount,
    ids: ids.length,
  });
  return result.rows;
}

(async () => {
  const client = new Client({
    connectionString: normalize(url),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    family: 4,
  });
  const tConnect = Date.now();
  await client.connect();
  console.log('connect_ms', Date.now() - tConnect);

  const pool = await client.query(`
    SELECT q."id" FROM "Question" q
    WHERE q."difficulty" = 'EASY'::"Difficulty"
      AND q."isActive" = true
      AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
  `);
  console.log('pool', pool.rowCount);

  const all = pool.rows.map((r) => r.id);
  await resolveN(client, all.slice(0, 3), 'resolve_3');
  await resolveN(client, all.slice(0, 5), 'resolve_5');
  await resolveN(client, all.slice(0, 10), 'resolve_10');

  // second connect (simulates next start after destroy)
  void client.end().catch(() => undefined);
  await new Promise((r) => setTimeout(r, 400));

  const c2 = new Client({
    connectionString: normalize(url),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    family: 4,
  });
  const t2 = Date.now();
  await c2.connect();
  console.log('connect2_ms', Date.now() - t2);
  await resolveN(c2, all.slice(0, 10), 'resolve_10_fresh');
  // fake insert payload size
  const snap = JSON.stringify({
    version: 2,
    questions: all.slice(0, 10).map((id, i) => ({
      questionId: id,
      position: i,
      displayTexts: { ru: 'x'.repeat(40), en: 'y'.repeat(40) },
      options: [1, 2, 3, 4].map((n) => ({
        optionId: `o${n}`,
        displayOrder: n,
        displayTexts: { ru: 'a', en: 'b' },
      })),
    })),
  });
  console.log('snapshot_json_bytes_10q', Buffer.byteLength(snap));
  const tIns = Date.now();
  // dry-run explain only — don't pollute
  await c2.query('SELECT length($1::text) AS n', [snap]);
  console.log('bind_json_ms', Date.now() - tIns);
  void c2.end().catch(() => undefined);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
