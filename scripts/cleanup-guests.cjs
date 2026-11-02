// Удаляет брошенных гостей: `isGuest`, создан больше 30 дней назад и не
// сыграл ни одной игры. Строки каскадом уносят свой мешок анти-повтора.
//
// Зачем: «Играть без регистрации» создаёт строку на каждый вход гостем;
// без чистки таблица User копит пустых гостей. Гостей с играми не трогаем —
// их ответы нужны статистике сложности вопросов, а строк немного.
// См. DECISIONS.md → Accounts without a password → Cleanup.
//
// По умолчанию только считает. Удаляет — с флагом --apply.
// На прод — только с разрешения владельца.
//
// Использование:
//   node scripts/cleanup-guests.cjs                                  — dev, подсчёт
//   node scripts/cleanup-guests.cjs --apply                          — dev, удалить
//   node scripts/cleanup-guests.cjs PROD_DATABASE_URL_UNPOOLED [--apply]
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const STALE_DAYS = 30;

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

// Одно условие и для подсчёта, и для удаления — чтобы они не разошлись.
const STALE_GUEST_WHERE = `
    u."isGuest" = true
    AND u."createdAt" < NOW() - make_interval(days => $1)
    AND NOT EXISTS (SELECT 1 FROM "QuizSession" s WHERE s."userId" = u."id")
`;

async function main() {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const [connectionEnvKey = 'DATABASE_URL_UNPOOLED'] = args.filter(
        (arg) => arg !== '--apply',
    );

    const client = new Client({
        connectionString: readEnv(connectionEnvKey),
        ssl: { rejectUnauthorized: true },
    });

    await client.connect();

    try {
        const totals = await client.query(
            `
                SELECT
                    COUNT(*) FILTER (WHERE u."isGuest") AS "guests",
                    COUNT(*) FILTER (WHERE ${STALE_GUEST_WHERE}) AS "stale"
                FROM "User" u
            `,
            [STALE_DAYS],
        );
        const { guests, stale } = totals.rows[0];

        console.log(
            `${connectionEnvKey}: guests=${guests}, stale (>${STALE_DAYS}d, no games)=${stale}`,
        );

        if (!apply) {
            console.log('Dry run. Add --apply to delete the stale guests.');
            return;
        }

        const deleted = await client.query(
            `DELETE FROM "User" u WHERE ${STALE_GUEST_WHERE}`,
            [STALE_DAYS],
        );

        console.log(`Deleted ${deleted.rowCount} stale guests.`);
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error('cleanup-guests failed:', error.message);
    process.exit(1);
});
