/**
 * Ops CLI: опубликовать TEXT DRAFT через тот же quality gate, что admin bulk Publish.
 *
 * Зачем: маленький batch (wave D1) можно закрыть из терминала без кликов,
 * но НЕ сырым UPDATE — blockers всё ещё стопят. Import по-прежнему только DRAFT.
 *
 * Usage:
 *   npm run content:publish-text-drafts -- --dry-run
 *   npm run content:publish-text-drafts
 *
 * Local Neon only (DATABASE_URL_UNPOOLED). Prod — через admin UI / отдельный шаг.
 * Canon: docs/CONTENT_PIPELINE.md (import ≠ publish; quality gate before PUBLISHED).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

import { questionRepository } from '@/entities/question/question.repository';
import {
    getQuestionPublishQualityIssues,
    hasPublishQualityBlockers,
} from '@/features/admin/lib/question-publish-quality';

function loadEnvFile(fileName: string): void {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) {
        return;
    }

    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

async function listTextDraftIds(): Promise<string[]> {
    const connectionString =
        process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
    }

    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 20_000,
        ssl: { rejectUnauthorized: false },
    });
    client.on('error', () => undefined);

    await client.connect();
    try {
        const result = await client.query<{ id: string }>(
            `
            SELECT q."id"
            FROM "Question" q
            WHERE q."type" = 'TEXT'::"QuestionType"
              AND q."publicationStatus" = 'DRAFT'::"QuestionPublicationStatus"
            ORDER BY q."createdAt" ASC
            `,
        );
        return result.rows.map((row) => row.id);
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function main(): Promise<void> {
    loadEnvFile('.env');
    loadEnvFile('.env.local');

    const dryRun = process.argv.includes('--dry-run');
    const draftIds = await listTextDraftIds();

    console.log(`TEXT DRAFT rows: ${draftIds.length}`);
    if (draftIds.length === 0) {
        console.log('Nothing to publish.');
        return;
    }

    const eligibleIds: string[] = [];
    const blocked: Array<{ id: string; codes: string[] }> = [];

    // Последовательно — как admin bulk (Neon не любит параллельные TLS).
    for (const id of draftIds) {
        const question = await questionRepository.findByIdForAdmin(id);
        if (!question) {
            console.log(`- skip missing ${id}`);
            continue;
        }

        const issues = getQuestionPublishQualityIssues(question);
        if (hasPublishQualityBlockers(issues)) {
            blocked.push({
                id,
                codes: issues
                    .filter((issue) => issue.severity === 'blocker')
                    .map((issue) => issue.code),
            });
            continue;
        }

        eligibleIds.push(id);
        const warnings = issues
            .filter((issue) => issue.severity === 'warning')
            .map((issue) => issue.code);
        console.log(
            `- eligible ${id.slice(0, 8)}… ${question.difficulty}` +
                (warnings.length > 0 ? ` warnings=${warnings.join(',')}` : ''),
        );
    }

    if (blocked.length > 0) {
        console.log('\nBlocked (not published):');
        for (const item of blocked) {
            console.log(`- ${item.id}: ${item.codes.join(', ')}`);
        }
    }

    console.log(`\nEligible: ${eligibleIds.length} / ${draftIds.length}`);

    if (dryRun) {
        console.log('Dry-run: no DB writes.');
        return;
    }

    if (eligibleIds.length === 0) {
        console.log('No eligible ids — abort.');
        process.exitCode = 1;
        return;
    }

    const result = await questionRepository.publishManyByIds(eligibleIds);
    console.log(`Published: ${result.updatedCount} (requested ${eligibleIds.length})`);
    console.log('Next: npm run content:smoke-text — expect DRAFT: 0, pool +N');
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
