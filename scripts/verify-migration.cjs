const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function readEnv(name) {
  const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  const match = env.match(new RegExp(`${name}="([^"]+)"`));
  if (!match) throw new Error(`Missing ${name}`);
  return match[1];
}

async function main() {
  const client = new Client({
    connectionString: readEnv("DATABASE_URL_UNPOOLED"),
    ssl: { rejectUnauthorized: true },
  });

  await client.connect();

  try {
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('QuizSessionQuestion', 'QuizSessionQuestionOption')
      ORDER BY table_name
    `);

    const migrations = await client.query(`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      ORDER BY started_at
    `);

    console.log("Tables:", tables.rows);
    console.log("Migrations:", migrations.rows);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
