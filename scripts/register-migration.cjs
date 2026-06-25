const { Client } = require("pg");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function readEnv(name) {
  const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  const match = env.match(new RegExp(`${name}="([^"]+)"`));
  if (!match) throw new Error(`Missing ${name}`);
  return match[1];
}

async function main() {
  const migrationName = "20250623193000_init";
  const migrationPath = path.join(
    __dirname,
    "..",
    "prisma",
    "migrations",
    migrationName,
    "migration.sql",
  );
  const checksum = crypto
    .createHash("sha256")
    .update(fs.readFileSync(migrationPath))
    .digest("hex");

  const client = new Client({
    connectionString: readEnv("DATABASE_URL_UNPOOLED"),
    ssl: { rejectUnauthorized: true },
  });

  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
    `);

    const existing = await client.query(
      `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1`,
      [migrationName],
    );

    if (existing.rowCount === 0) {
      await client.query(
        `
          INSERT INTO "_prisma_migrations" (
            "id",
            "checksum",
            "finished_at",
            "migration_name",
            "logs",
            "started_at",
            "applied_steps_count"
          ) VALUES ($1, $2, NOW(), $3, NULL, NOW(), 1);
        `,
        [crypto.randomUUID(), checksum, migrationName],
      );
      console.log("Registered migration in _prisma_migrations.");
    } else {
      console.log("Migration already registered.");
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
