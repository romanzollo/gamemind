/**
 * CLI: проверить draft JSON без записи в БД.
 *
 * Usage:
 *   npm run content:validate-drafts
 *   npm run content:validate-drafts -- path/to/batch.json
 *   npm run content:validate-drafts -- path/to/batch.json --fail-on-publish-blockers
 *
 * Exit codes:
 *   0 — контракт ок (warnings/blockers только печатаются)
 *   1 — нет файла / битый JSON / контракт fail / (опционально) publish blockers
 *
 * Canon: docs/CONTENT_PIPELINE.md; логика — validateDraftQuestionsBatch.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { validateDraftQuestionsBatch } from '../src/features/content/lib/validate-draft-questions';

const DEFAULT_PATH = 'content/drafts/examples/sample-text-v1.json';

function printUsage(): void {
    console.log(`Usage:
  npm run content:validate-drafts
  npm run content:validate-drafts -- <file.json> [--fail-on-publish-blockers]

Default file: ${DEFAULT_PATH}`);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');

    if (args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

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

    const result = validateDraftQuestionsBatch(parsed);

    console.log(`File: ${relativePath}`);

    if (!result.ok) {
        console.error('Contract: FAIL');
        for (const issue of result.issues) {
            console.error(`  - [${issue.path}] ${issue.message}`);
        }
        process.exit(1);
    }

    console.log(`Contract: OK (${result.batch.questions.length} questions)`);

    let warningCount = 0;
    let blockerCount = 0;

    for (const report of result.qualityReports) {
        if (report.issues.length === 0) {
            continue;
        }

        const label = report.draftKey ?? `#${report.index}`;
        console.log(`Quality [${label}]:`);

        for (const issue of report.issues) {
            if (issue.severity === 'blocker') {
                blockerCount += 1;
            } else {
                warningCount += 1;
            }
            console.log(`  - (${issue.severity}) ${issue.code}`);
        }
    }

    if (blockerCount === 0 && warningCount === 0) {
        console.log('Publish quality: clean (no issues)');
    } else {
        console.log(
            `Publish quality summary: ${blockerCount} blocker(s), ${warningCount} warning(s)`,
        );
        console.log(
            'Note: blockers do not fail import-as-DRAFT; they block publish later.',
        );
    }

    if (failOnPublishBlockers && result.hasPublishBlockers) {
        console.error(
            'Failing because --fail-on-publish-blockers is set and blockers exist.',
        );
        process.exit(1);
    }

    process.exit(0);
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
