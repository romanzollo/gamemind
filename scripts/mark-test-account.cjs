// Помечает аккаунт служебным (User.isTestAccount) — он перестаёт попадать в рейтинги.
//
// Зачем: прод-smoke после каждого деплоя играет Классику и Блиц под отдельным
// аккаунтом; без флага он занимал бы места в топе. Аккаунт регистрируется
// обычным способом (страница регистрации), флаг ставится здесь — в интерфейсе
// переключателя нет намеренно. См. DECISIONS.md → Prod smoke after deploy.
//
// Использование:
//   node scripts/mark-test-account.cjs <email>                     — dev (DATABASE_URL_UNPOOLED)
//   node scripts/mark-test-account.cjs <email> PROD_DATABASE_URL_UNPOOLED
//   node scripts/mark-test-account.cjs <email> [ENV_KEY] --off     — снять флаг
const { Client } = require('pg');
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
    const args = process.argv.slice(2);
    const turnOff = args.includes('--off');
    const [email, connectionEnvKey = 'DATABASE_URL_UNPOOLED'] = args.filter(
        (arg) => arg !== '--off',
    );

    if (!email) {
        throw new Error(
            'Usage: node scripts/mark-test-account.cjs <email> [CONNECTION_ENV_KEY] [--off]',
        );
    }

    const client = new Client({
        connectionString: readEnv(connectionEnvKey),
        ssl: { rejectUnauthorized: true },
    });

    await client.connect();

    try {
        // Email в БД хранится в нижнем регистре (registerSchema → toLowerCase).
        const result = await client.query(
            `
                UPDATE "User"
                SET "isTestAccount" = $1, "updatedAt" = NOW()
                WHERE "email" = lower($2)
                RETURNING "username", "role", "isTestAccount"
            `,
            [!turnOff, email.trim()],
        );

        const row = result.rows[0];

        if (!row) {
            throw new Error(`No user with this email (${connectionEnvKey})`);
        }

        if (row.role === 'ADMIN' && !turnOff) {
            console.warn(
                'Warning: this is an ADMIN account. Smoke should use a regular player.',
            );
        }

        console.log(
            `${row.username}: isTestAccount=${row.isTestAccount} (${connectionEnvKey}, host redacted)`,
        );
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error('mark-test-account failed:', error.message);
    process.exit(1);
});
