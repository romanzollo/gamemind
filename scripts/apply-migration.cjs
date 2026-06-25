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
  const sqlPath = path.join(
    __dirname,
    "..",
    "prisma",
    "migrations",
    "20250623193000_init",
    "migration.sql",
  );
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: readEnv("DATABASE_URL_UNPOOLED"),
    ssl: { rejectUnauthorized: true },
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
