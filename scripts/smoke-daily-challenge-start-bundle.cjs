/**
 * Smoke: ensure day + load bilingual bundle by frozen questionIds (no auth).
 * Usage: npx tsx scripts/smoke-daily-challenge-start-bundle.cjs
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
    const ensureMod = await import(
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
    const questionMod = await import(
        pathToFileURL(
            path.join(
                __dirname,
                '..',
                'src',
                'entities',
                'question',
                'question.repository.ts',
            ),
        ).href
    );

    const ensured = await ensureMod.ensureDailyChallenge();
    if (!ensured.ok) {
        console.error('ensure failed', ensured);
        process.exit(1);
    }

    const bundle =
        await questionMod.questionRepository.pickSnapshotBundleByQuestionIds(
            ensured.challenge.questionIds,
            'ru',
        );

    console.log({
        challengeDate: ensured.challenge.challengeDate,
        frozenIds: ensured.challenge.questionIds,
        bundleIds: bundle.map((q) => q.id),
        orderMatch:
            bundle.length === ensured.challenge.questionIds.length &&
            bundle.every(
                (q, i) => q.id === ensured.challenge.questionIds[i],
            ),
        optionCounts: bundle.map((q) => q.options.length),
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
