// скрипт для применения именованной миграции
const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function readEnv(name) {
    const fromProcess = process.env[name];
    if (typeof fromProcess === 'string' && fromProcess.trim() !== '') {
        return fromProcess.trim();
    }

    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const match = env.match(new RegExp(`${name}="([^"]+)"`));
    if (!match) throw new Error(`Missing ${name}`);
    return match[1];
}

async function main() {
    const migrationName = process.argv[2];
    // Optional 3rd arg: env key for connection string (default local unpooled).
    // Example prod: node scripts/apply-named-migration.cjs 20260718190000_user_is_active PROD_DATABASE_URL_UNPOOLED
    const connectionEnvKey = process.argv[3] || 'DATABASE_URL_UNPOOLED';

    if (!migrationName) {
        throw new Error(
            'Usage: node scripts/apply-named-migration.cjs <migration_folder_name> [CONNECTION_ENV_KEY]',
        );
    }

    const migrationPath = path.join(
        __dirname,
        '..',
        'prisma',
        'migrations',
        migrationName,
        'migration.sql',
    );

    if (!fs.existsSync(migrationPath)) {
        throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const connectionString = readEnv(connectionEnvKey);

    console.log(
        `Applying ${migrationName} using ${connectionEnvKey} (host redacted)...`,
    );

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: true },
    });

    await client.connect();

    try {
        await client.query(sql);

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
            console.log(`Registered migration: ${migrationName}`);
        } else {
            console.log(`Migration already registered: ${migrationName}`);
        }

        console.log('Migration applied successfully.');
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error('Migration failed:', error.message);
    process.exit(1);
});
