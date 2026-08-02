/**
 * One UPDATE per connection — Neon often drops long Windows sessions mid-batch.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function readEnv(name) {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const match = env.match(new RegExp(`${name}="([^"]+)"`));
    if (!match) throw new Error(`Missing ${name}`);
    return match[1];
}

function connectionString() {
    return (
        process.env.DATABASE_URL_UNPOOLED ||
        (() => {
            try {
                return readEnv('DATABASE_URL_UNPOOLED');
            } catch {
                return readEnv('DATABASE_URL');
            }
        })()
    );
}

async function withClient(fn) {
    const client = new Client({
        connectionString: connectionString(),
        ssl: { rejectUnauthorized: false },
        family: 4,
    });
    await client.connect();
    try {
        return await fn(client);
    } finally {
        try {
            await client.end();
        } catch {
            /* ignore */
        }
    }
}

async function applyFix(from, to) {
    return withClient(async (client) => {
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
        return { from, to, translations: tr.rowCount, legacy: legacy.rowCount };
    });
}

async function main() {
    const fixes = [
        { from: 'B.J. Blazkowicz', to: 'Би.Джей Блазкович' },
        { from: 'P-Body', to: 'П-Боди' },
        { from: 'Duke Nukem', to: 'Дюк Нюкем' },
        { from: 'Doomguy Jr.', to: 'Думгай-младший' },
        { from: 'Doom Slayer', to: 'Палач Рока' },
        { from: 'Рапчур', to: 'Восторг' },
    ];

    for (const { from, to } of fixes) {
        try {
            const result = await applyFix(from, to);
            console.log(
                `${result.from} → ${result.to}: translations=${result.translations}, legacy=${result.legacy}`,
            );
        } catch (error) {
            console.error(`FAILED ${from} → ${to}:`, error.message);
        }
    }

    console.log('OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
