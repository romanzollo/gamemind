/**
 * Read-only smoke: найти sample draft-вопросы по RU-тексту и показать
 * publicationStatus / isActive.
 *
 * Зачем: шаг 5 content pipeline — проверить, что import попал в DRAFT,
 * а после ручного publish в admin статус сменился. Без записи в БД.
 *
 * Usage:
 *   npm run content:smoke-status
 *
 * Canon: docs/CONTENT_PIPELINE.md §9.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

/** RU prompts from content/drafts/examples/sample-text-v1.json */
const SAMPLE_QUESTION_RU = [
    'Как называется культовый куб-спутник из Portal?',
    'Какая из этих игр вышла первой?',
    'Как называется парящий город из BioShock Infinite?',
] as const;

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

function normalizeConnectionString(connectionString: string): string {
    try {
        const url = new URL(connectionString);
        const sslmode = url.searchParams.get('sslmode');
        if (!sslmode || ['prefer', 'require', 'verify-ca'].includes(sslmode)) {
            url.searchParams.set('sslmode', 'verify-full');
        }
        return url.toString();
    } catch {
        return connectionString;
    }
}

async function main(): Promise<void> {
    loadEnvFile('.env');
    loadEnvFile('.env.local');

    const connectionString =
        process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

    if (!connectionString) {
        console.error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
        process.exit(1);
    }

    const client = new Client({
        connectionString: normalizeConnectionString(connectionString),
        connectionTimeoutMillis: 20_000,
        ssl: { rejectUnauthorized: true },
    });

    await client.connect();

    try {
        const result = await client.query<{
            id: string;
            publicationStatus: string;
            isActive: boolean;
            difficulty: string;
            text: string;
        }>(
            `
            SELECT
                q."id",
                q."publicationStatus"::text AS "publicationStatus",
                q."isActive",
                q."difficulty"::text AS difficulty,
                qt."text"
            FROM "Question" q
            INNER JOIN "QuestionTranslation" qt
                ON qt."questionId" = q."id"
               AND qt."locale" = 'ru'::"ContentLocale"
            WHERE qt."text" = ANY($1::text[])
            ORDER BY q."createdAt" DESC
            `,
            [SAMPLE_QUESTION_RU],
        );

        if (result.rows.length === 0) {
            console.error(
                'No sample questions found. Run import first:\n  npm run content:import-drafts -- content/drafts/examples/sample-text-v1.json',
            );
            process.exit(1);
        }

        console.log(`Found ${result.rows.length} row(s) matching sample RU texts:`);
        console.log('(If you imported more than once, several DRAFT copies may appear.)\n');

        let draftCount = 0;
        let publishedCount = 0;

        for (const row of result.rows) {
            if (row.publicationStatus === 'DRAFT') {
                draftCount += 1;
            }
            if (row.publicationStatus === 'PUBLISHED') {
                publishedCount += 1;
            }

            console.log(
                `- ${row.id} | ${row.publicationStatus} | active=${row.isActive} | ${row.difficulty}`,
            );
            console.log(`  ${row.text}`);
        }

        console.log('\nSummary:');
        console.log(`  DRAFT: ${draftCount}`);
        console.log(`  PUBLISHED: ${publishedCount}`);
        console.log(
            '  Quiz pool needs: publicationStatus=PUBLISHED AND isActive=true',
        );
        console.log(
            '\nAdmin: /ru/admin/questions?publication=DRAFT (or PUBLISHED after smoke publish)',
        );
    } finally {
        await client.end().catch(() => undefined);
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
