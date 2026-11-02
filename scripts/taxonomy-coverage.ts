/**
 * CLI (только чтение): сколько опубликованных активных вопросов у каждой
 * метки, по сложностям. Ответ на вопрос «какой фильтр можно предложить
 * игроку»: Классике 10 нужно минимум 10 вопросов одной сложности, иначе
 * мешок анти-повтора крутит одни и те же.
 *
 * Метка семейства (PlayStation) считается вместе с детьми (PS1…PS5).
 *
 * Usage:
 *   npm run taxonomy:coverage
 *   npm run taxonomy:coverage -- --facet=platform
 *   npm run taxonomy:coverage -- PROD_DATABASE_URL_UNPOOLED
 *
 * Canon: docs/DECISIONS.md → Content taxonomy.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

type CoverageRow = {
    facet: string;
    tag: string;
    name: string;
    easy: number;
    medium: number;
    hard: number;
    total: number;
};

function readEnv(name: string): string {
    const fromProcess = process.env[name];
    if (fromProcess && fromProcess.trim() !== '') {
        return fromProcess.trim();
    }
    const envPath = resolve(process.cwd(), '.env');
    if (existsSync(envPath)) {
        const match = readFileSync(envPath, 'utf8').match(
            new RegExp(`${name}="([^"]+)"`),
        );
        if (match) {
            return match[1];
        }
    }
    throw new Error(`Missing ${name}`);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    const envKey =
        args.find((arg) => !arg.startsWith('--')) ?? 'DATABASE_URL_UNPOOLED';
    const facetFilter = args
        .find((arg) => arg.startsWith('--facet='))
        ?.slice('--facet='.length);

    const client = new Client({
        connectionString: readEnv(envKey),
        ssl: { rejectUnauthorized: true },
    });
    await client.connect();

    try {
        await client.query('SET default_transaction_read_only = on');

        // Вопрос попадает в метку, если связан с ней или с её ребёнком.
        const rows = (
            await client.query<CoverageRow>(`
                WITH pool AS (
                    SELECT q."id", q."difficulty"
                    FROM "Question" q
                    WHERE q."isActive" = true
                        AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
                ),
                tagged AS (
                    SELECT DISTINCT COALESCE(t."parentId", t."id") AS tag_id, qt."questionId"
                    FROM "QuestionTag" qt JOIN "Tag" t ON t."id" = qt."tagId"
                    UNION
                    SELECT DISTINCT qt."tagId", qt."questionId"
                    FROM "QuestionTag" qt
                )
                SELECT
                    f."slug" AS facet,
                    t."slug" AS tag,
                    t."nameRu" AS name,
                    COUNT(*) FILTER (WHERE p."difficulty" = 'EASY')::int AS easy,
                    COUNT(*) FILTER (WHERE p."difficulty" = 'MEDIUM')::int AS medium,
                    COUNT(*) FILTER (WHERE p."difficulty" = 'HARD')::int AS hard,
                    COUNT(*)::int AS total
                FROM tagged x
                JOIN pool p ON p."id" = x."questionId"
                JOIN "Tag" t ON t."id" = x.tag_id
                JOIN "Facet" f ON f."id" = t."facetId"
                GROUP BY f."slug", f."sortOrder", t."slug", t."nameRu"
                ORDER BY f."sortOrder", total DESC, t."slug"
            `)
        ).rows;

        const untagged = (
            await client.query<{ count: number }>(`
                SELECT COUNT(*)::int AS count
                FROM "Question" q
                WHERE q."isActive" = true
                    AND q."publicationStatus" = 'PUBLISHED'::"QuestionPublicationStatus"
                    AND NOT EXISTS (SELECT 1 FROM "QuestionTag" qt WHERE qt."questionId" = q."id")
            `)
        ).rows[0].count;

        console.log(
            `${envKey}: published active questions without tags: ${untagged}`,
        );
        for (const facet of [...new Set(rows.map((row) => row.facet))]) {
            if (facetFilter && facet !== facetFilter) {
                continue;
            }
            const facetRows = rows.filter((row) => row.facet === facet);
            const playable = facetRows.filter(
                (row) => Math.min(row.easy, row.medium, row.hard) >= 10,
            ).length;
            console.log(
                `\n## ${facet} — ${facetRows.length} tags, ${playable} with ≥10 per difficulty`,
            );
            console.table(
                facetRows.slice(0, facetFilter ? undefined : 15).map((row) => ({
                    tag: row.tag,
                    name: row.name,
                    easy: row.easy,
                    medium: row.medium,
                    hard: row.hard,
                    total: row.total,
                })),
            );
        }
    } finally {
        await client.end();
    }
}

main().catch((error: unknown) => {
    console.error(
        'taxonomy-coverage failed:',
        error instanceof Error ? error.message : error,
    );
    process.exit(1);
});
