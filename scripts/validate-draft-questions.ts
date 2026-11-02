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
 *   1 — нет файла / битый JSON / контракт fail / метки не из каталога /
 *       (опционально) publish blockers
 *
 * Canon: docs/CONTENT_PIPELINE.md; логика — validateDraftQuestionsBatch.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { DraftQuestionsBatch } from '../src/features/content/lib/draft-questions.schema';
import { validateDraftQuestionsBatch } from '../src/features/content/lib/validate-draft-questions';
import {
    buildTaxonomyIndex,
    expandTagRefs,
    refForGameName,
} from '../src/features/content/taxonomy';
import { loadTaxonomyCatalog } from '../src/features/content/taxonomy/load-taxonomy-files';

/**
 * Метки черновика сверяются с каталогом: неизвестная метка — ошибка
 * (taxonomy:sync её не запишет), неизвестная игра в `metadata.game` —
 * предупреждение (вопрос останется без меток, пока игру не внесут).
 */
function checkTaxonomy(batch: DraftQuestionsBatch): { errors: number } {
    const index = buildTaxonomyIndex(loadTaxonomyCatalog(process.cwd()));
    let errors = 0;
    let warnings = 0;

    batch.questions.forEach((question, position) => {
        const label = question.draftKey ?? `#${position}`;
        if (question.tags) {
            for (const ref of expandTagRefs(index, question.tags).unknownRefs) {
                errors += 1;
                console.error(`  - [${label}] unknown tag "${ref}"`);
            }
            return;
        }
        const game = question.metadata?.game;
        if (typeof game === 'string' && !refForGameName(index, game)) {
            warnings += 1;
            console.log(
                `  - [${label}] game "${game}" is not in content/taxonomy/games.json`,
            );
        }
    });

    console.log(
        errors === 0 && warnings === 0
            ? 'Taxonomy: OK'
            : `Taxonomy: ${errors} error(s), ${warnings} warning(s)`,
    );
    return { errors };
}

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

    if (checkTaxonomy(result.batch).errors > 0) {
        process.exit(1);
    }

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
