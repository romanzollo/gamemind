const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function readEnv(name) {
  const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  const match = env.match(new RegExp(`${name}="([^"]+)"`));
  if (!match) throw new Error(`Missing ${name}`);
  return match[1];
}

async function test(label, connectionString) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 20000,
    ssl: { rejectUnauthorized: true },
  });

  try {
    await client.connect();
    const result = await client.query("SELECT 1 AS ok");
    console.log(`${label}: OK`, result.rows[0]);
  } catch (error) {
    console.error(`${label}: FAIL`, error.message);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  await test("DIRECT", readEnv("DATABASE_URL_UNPOOLED"));
  await test("POOLED", readEnv("DATABASE_URL"));
}

main();
