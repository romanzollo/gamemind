/**
 * One-off content fix: official RU names (BioShock Rapture → Восторг,
 * DOOM Slayer → Палач Рока). Updates translation + legacy text columns.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function readEnv(name) {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const match = env.match(new RegExp(`${name}="([^"]+)"`));
    if (!match) {
        throw new Error(`Missing ${name}`);
    }
    return match[1];
}

async function main() {
    const connectionString =
        process.env.DATABASE_URL_UNPOOLED ||
        (() => {
            try {
                return readEnv('DATABASE_URL_UNPOOLED');
            } catch {
                return readEnv('DATABASE_URL');
            }
        })();

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        family: 4,
    });

    await client.connect();

    const fixes = [
        { from: 'Рапчур', to: 'Восторг' },
        { from: 'Doom Slayer', to: 'Палач Рока' },
    ];

    for (const { from, to } of fixes) {
        const tr = await client.query(
            `
                UPDATE "AnswerOptionTranslation"
                SET text = $1
                WHERE locale = 'ru' AND text = $2
            `,
            [to, from],
        );
        const legacy = await client.query(
            `
                UPDATE "AnswerOption"
                SET text = $1
                WHERE text = $2
            `,
            [to, from],
        );
        console.log(
            `${from} → ${to}: translations=${tr.rowCount}, legacy=${legacy.rowCount}`,
        );
    }

    await client.end();
    console.log('OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
