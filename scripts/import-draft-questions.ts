/**
 * CLI: import draft JSON → DB rows with publicationStatus=DRAFT.
 *
 * Usage:
 *   npm run content:import-drafts -- --dry-run
 *   npm run content:import-drafts -- content/drafts/examples/sample-text-v1.json --dry-run
 *   npm run content:import-drafts -- content/drafts/examples/sample-text-v1.json
 *
 * Requires DATABASE_URL_UNPOOLED (or DATABASE_URL) in .env — same as seed/smoke.
 * Never sets PUBLISHED. Re-run creates new UUID rows (not idempotent).
 *
 * Canon: docs/CONTENT_PIPELINE.md.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { importDraftQuestionsBatch } from '../src/features/content/lib/import-draft-questions';

const DEFAULT_PATH = 'content/drafts/examples/sample-text-v1.json';

function loadEnvFile(fileName: string): void {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) {
        return;
    }

    const text = readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const eq = trimmed.indexOf('=');
        if (eq === -1) {
            continue;
        }

        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}

function printUsage(): void {
    console.log(`Usage:
  npm run content:import-drafts -- --dry-run
  npm run content:import-drafts -- <file.json> [--dry-run] [--fail-on-publish-blockers]

Default file: ${DEFAULT_PATH}
Import always creates DRAFT rows (never PUBLISHED).`);
}

async function main(): Promise<void> {
    loadEnvFile('.env');
    loadEnvFile('.env.local');

    const args = process.argv.slice(2).filter((arg) => arg !== '--');

    if (args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

    const dryRun = args.includes('--dry-run');
    const failOnPublishBlockers = args.includes('--fail-on-publish-blockers');
    const fileArg = args.find((arg) => !arg.startsWith('--'));
    const relativePath = fileArg ?? DEFAULT_PATH;
    const absolutePath = resolve(process.cwd(), relativePath);

    if (!existsSync(absolutePath)) {
        console.error(`File not found: ${relativePath}`);
        process.exit(1);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(absolutePath, 'utf8')) as unknown;
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Unknown JSON parse error';
        console.error(`Invalid JSON in ${relativePath}: ${message}`);
        process.exit(1);
    }

    console.log(`File: ${relativePath}`);
    console.log(`Mode: ${dryRun ? 'dry-run (no DB write)' : 'import DRAFT'}`);

    const result = await importDraftQuestionsBatch(parsed, {
        dryRun,
        failOnPublishBlockers,
    });

    if (!result.ok) {
        if (result.stage === 'validate') {
            console.error('Contract: FAIL');
            for (const issue of result.issues) {
                console.error(`  - [${issue.path}] ${issue.message}`);
            }
            process.exit(1);
        }

        if (result.stage === 'publish_blockers') {
            console.error('Refusing import: publish blockers present.');
            for (const report of result.qualityReports) {
                const label = report.draftKey ?? `#${report.index}`;
                for (const issue of report.issues) {
                    if (issue.severity === 'blocker') {
                        console.error(`  - [${label}] ${issue.code}`);
                    }
                }
            }
            process.exit(1);
        }

        if (result.stage === 'map') {
            console.error(
                `Map/create schema failed at question #${result.index}` +
                    (result.draftKey ? ` (${result.draftKey})` : '') +
                    `: ${result.message}`,
            );
            process.exit(1);
        }

        console.error(
            `Create failed at question #${result.index}` +
                (result.draftKey ? ` (${result.draftKey})` : '') +
                `: ${result.message}`,
        );
        if (result.createdBeforeFailure.length > 0) {
            console.error(
                `Already created ${result.createdBeforeFailure.length} DRAFT row(s) before failure:`,
            );
            for (const item of result.createdBeforeFailure) {
                console.error(
                    `  - ${item.id}` +
                        (item.draftKey ? ` (${item.draftKey})` : ''),
                );
            }
        }
        process.exit(1);
    }

    if (result.hasPublishBlockers) {
        console.log(
            'Warning: some questions have publish blockers (ok for DRAFT; fix before publish).',
        );
    }

    if (result.dryRun) {
        console.log(`Dry-run OK: would create ${result.planned.length} DRAFT question(s):`);
        for (const item of result.planned) {
            console.log(
                `  - #${item.index} ${item.difficulty}` +
                    (item.draftKey ? ` [${item.draftKey}]` : ''),
            );
        }
        console.log('No database writes were made.');
        process.exit(0);
    }

    console.log(`Imported ${result.created.length} DRAFT question(s):`);
    for (const item of result.created) {
        console.log(
            `  - ${item.id} ${item.difficulty}` +
                (item.draftKey ? ` [${item.draftKey}]` : ''),
        );
    }
    console.log(
        'Next: open /ru/admin/questions?publication=DRAFT — review, then publish via existing UI/gate.',
    );
    process.exit(0);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
