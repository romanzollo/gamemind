/**
 * Smoke: lazy ensure DailyChallenge for «сегодня» (Moscow) against local Neon.
 * Usage: npx tsx scripts/smoke-daily-challenge-ensure.cjs
 */
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

function loadEnvFile(fileName) {
    const filePath = path.join(__dirname, '..', fileName);
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

async function main() {
    const mod = await import(
        pathToFileURL(
            path.join(
                __dirname,
                '..',
                'src',
                'features',
                'daily-challenge',
                'lib',
                'ensure-daily-challenge.ts',
            ),
        ).href
    );

    const first = await mod.ensureDailyChallenge();
    const second = await mod.ensureDailyChallenge();

    console.log('first:', JSON.stringify(first, null, 2));
    console.log('second.created:', second.ok ? second.created : second);
    console.log(
        'same id:',
        first.ok && second.ok && first.challenge.id === second.challenge.id,
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
