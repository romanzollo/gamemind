/**
 * Ops CLI: опубликовать TEXT DRAFT через тот же quality gate, что admin bulk Publish.
 *
 * Зачем: маленький batch можно закрыть из терминала без кликов, но НЕ сырым
 * UPDATE — blockers стопят. Import по-прежнему только DRAFT.
 *
 * Usage:
 *   npm run content:publish-text-drafts -- --dry-run
 *   npm run content:publish-text-drafts
 *   npm run content:publish-text-drafts -- --target=prod --dry-run
 *   npm run content:publish-text-drafts -- --target=prod
 *
 * Опционально ограничить пакетом:
 *   --file=content/drafts/batches/2026-08-12-text-wave-d1-6.json
 * (только DRAFT, чей RU-текст есть в файле — безопаснее на prod)
 *
 * Canon: docs/CONTENT_PIPELINE.md (import ≠ publish; quality gate before PUBLISHED).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

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

function hostnameOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

function parseArgs(argv: string[]) {
    const fileArg = argv.find((arg) => arg.startsWith('--file='));
    return {
        dryRun: argv.includes('--dry-run'),
        target: argv.includes('--target=prod') ? ('prod' as const) : ('local' as const),
        fileRel: fileArg ? fileArg.slice('--file='.length) : null,
    };
}

/**
 * Prod URL в DATABASE_URL* до первого import репозитория — иначе модуль
 * может закешировать local pool (урок Aug 4: local ≠ prod Neon).
 */
function applyTargetEnv(target: 'local' | 'prod'): string {
    if (target === 'local') {
        const url =
            process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
        if (!url) {
            throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
        }
        return url;
    }

    const prodUrl = process.env.PROD_DATABASE_URL_UNPOOLED;
    if (!prodUrl) {
        throw new Error(
            'PROD_DATABASE_URL_UNPOOLED is required for --target=prod',
        );
    }
    const host = hostnameOf(prodUrl);
    if (host.includes('jolly-river')) {
        throw new Error(
            `Refusing --target=prod: host looks like local Neon (${host})`,
        );
    }
    process.env.DATABASE_URL_UNPOOLED = prodUrl;
    process.env.DATABASE_URL = prodUrl;
    return prodUrl;
}

function loadBatchRuTexts(fileRel: string): Set<string> {
    const absolutePath = resolve(process.cwd(), fileRel);
    if (!existsSync(absolutePath)) {
        throw new Error(`Batch file not found: ${fileRel}`);
    }

    const parsed = JSON.parse(readFileSync(absolutePath, 'utf8')) as {
        questions?: Array<{ translations?: { ru?: { text?: string } } }>;
    };

    const texts = new Set<string>();
    for (const question of parsed.questions ?? []) {
        const ru = question.translations?.ru?.text?.trim();
        if (ru) {
            texts.add(ru);
        }
    }

    if (texts.size === 0) {
        throw new Error(`No RU question texts in ${fileRel}`);
    }

    return texts;
}

async function listTextDraftIds(
    connectionString: string,
    ruFilter: Set<string> | null,
): Promise<string[]> {
    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 20_000,
        ssl: { rejectUnauthorized: false },
    });
    client.on('error', () => undefined);

    await client.connect();
    try {
        if (!ruFilter) {
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
        }

        const result = await client.query<{ id: string }>(
            `
            SELECT q."id"
            FROM "Question" q
            INNER JOIN "QuestionTranslation" qt
                ON qt."questionId" = q."id"
               AND qt."locale" = 'ru'::"ContentLocale"
            WHERE q."type" = 'TEXT'::"QuestionType"
              AND q."publicationStatus" = 'DRAFT'::"QuestionPublicationStatus"
              AND qt."text" = ANY($1::text[])
            ORDER BY q."createdAt" ASC
            `,
            [[...ruFilter]],
        );
        return result.rows.map((row) => row.id);
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function main(): Promise<void> {
    loadEnvFile('.env');
    loadEnvFile('.env.local');

    const { dryRun, target, fileRel } = parseArgs(process.argv.slice(2));

    if (target === 'prod' && !fileRel) {
        throw new Error(
            'Refusing --target=prod without --file=… (publish only that batch RU texts)',
        );
    }

    const connectionString = applyTargetEnv(target);
    const host = hostnameOf(connectionString);

    // Dynamic import после подмены env — репозиторий читает URL при первом connect.
    const { questionRepository } = await import(
        '@/entities/question/question.repository'
    );
    const {
        getQuestionPublishQualityIssues,
        hasPublishQualityBlockers,
    } = await import('@/features/admin/lib/question-publish-quality');

    const ruFilter = fileRel ? loadBatchRuTexts(fileRel) : null;

    console.log(`Publish TEXT DRAFT (${target})`);
    console.log(`  host: ${host || '(unknown)'}`);
    if (fileRel) {
        console.log(`  filter file: ${fileRel} (${ruFilter?.size ?? 0} RU texts)`);
    }

    const draftIds = await listTextDraftIds(connectionString, ruFilter);

    console.log(`TEXT DRAFT rows matched: ${draftIds.length}`);
    if (draftIds.length === 0) {
        console.log('Nothing to publish.');
        return;
    }

    const eligibleIds: string[] = [];
    const blocked: Array<{ id: string; codes: string[] }> = [];

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
    console.log(
        `Published: ${result.updatedCount} (requested ${eligibleIds.length})`,
    );
    console.log(
        `Next: npm run content:smoke-text${target === 'prod' ? ' -- --target=prod' : ''}`,
    );
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
