/**
 * CLI: каталог таксономии (content/taxonomy) → БД.
 *
 * Заполняет Question.contentKey, где он NULL; создаёт / обновляет Domain,
 * Facet и Tag; добавляет связи QuestionTag, которые даёт каталог.
 * По умолчанию только показывает план. `--apply` пишет, `--prune` ещё и
 * снимает связи, которых каталог больше не даёт.
 *
 * Запись — упорядоченные autocommit-запросы без BEGIN (Neon write path,
 * DECISIONS); каждый идемпотентен, повторный запуск доводит начатое.
 * Прод — только по команде владельца и после миграций
 * 20261102120000_content_taxonomy и 20261103120000_play_topics
 * (`Tag.playOrder` — темы игры из `playTopics`).
 *
 * Usage:
 *   npm run taxonomy:sync                                   — dev, план
 *   npm run taxonomy:sync -- --apply                        — dev, запись
 *   npm run taxonomy:sync -- PROD_DATABASE_URL_UNPOOLED [--apply] [--prune]
 *
 * Canon: docs/DECISIONS.md → Content taxonomy.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

import {
    buildDraftTextIndex,
    buildTaxonomyIndex,
    planTaxonomySync,
    type SyncDraftQuestion,
    type SyncQuestionRow,
} from '../src/features/content/taxonomy';
import {
    loadDraftBatches,
    loadFixFiles,
    loadQuestionOverrides,
    loadTaxonomyCatalog,
} from '../src/features/content/taxonomy/load-taxonomy-files';

/** Строк в одном INSERT/UPDATE через unnest: держит запрос коротким. */
const CHUNK = 500;

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

function chunks<T>(items: readonly T[]): T[][] {
    const result: T[][] = [];
    for (let start = 0; start < items.length; start += CHUNK) {
        result.push(items.slice(start, start + CHUNK));
    }
    return result;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    const apply = args.includes('--apply');
    const prune = args.includes('--prune');
    const envKey =
        args.find((arg) => !arg.startsWith('--')) ?? 'DATABASE_URL_UNPOOLED';
    const root = process.cwd();

    const catalog = loadTaxonomyCatalog(root);
    const index = buildTaxonomyIndex(catalog);
    const overrides = loadQuestionOverrides(root);
    const batches = loadDraftBatches(root);
    const draftText = buildDraftTextIndex(batches, loadFixFiles(root));
    const draftsByKey = new Map<string, SyncDraftQuestion>();
    for (const batch of batches) {
        for (const question of batch.questions) {
            if (question.draftKey) {
                draftsByKey.set(question.draftKey, {
                    tags: question.tags,
                    metadata: question.metadata,
                });
            }
        }
    }

    const client = new Client({
        connectionString: readEnv(envKey),
        ssl: { rejectUnauthorized: true },
    });
    await client.connect();

    try {
        const questions = (
            await client.query<SyncQuestionRow>(
                `
                SELECT
                    q."id",
                    q."type",
                    q."publicationStatus",
                    q."isActive",
                    q."contentKey",
                    q."metadata",
                    t."text" AS "ruText"
                FROM "Question" q
                LEFT JOIN "QuestionTranslation" t
                    ON t."questionId" = q."id" AND t."locale" = 'ru'
                WHERE q."domainId" = $1
            `,
                [index.domain.id],
            )
        ).rows;
        const existingTags = (
            await client.query(
                `
                SELECT t."id", t."nameRu", t."nameEn", t."parentId", t."sortOrder", t."playOrder"
                FROM "Tag" t
                JOIN "Facet" f ON f."id" = t."facetId"
                WHERE f."domainId" = $1
            `,
                [index.domain.id],
            )
        ).rows;
        const existingLinks = (
            await client.query<{ questionId: string; tagId: string }>(
                `
                SELECT qt."questionId", qt."tagId"
                FROM "QuestionTag" qt
                JOIN "Question" q ON q."id" = qt."questionId"
                WHERE q."domainId" = $1
            `,
                [index.domain.id],
            )
        ).rows;

        const plan = planTaxonomySync({
            index,
            overrides,
            draftsByKey,
            draftText,
            questions,
            existingTags,
            existingLinks,
            prune,
        });

        const { report } = plan;
        console.log(
            `${envKey}: ${questions.length} questions in domain "${index.domain.id}"`,
        );
        console.log(
            `  tags to create/update: ${plan.tagUpserts.length} (catalog: ${index.tags.length})`,
        );
        console.log(
            `  contentKey to set:     ${plan.contentKeys.length}`,
            countBy(plan.contentKeys.map((item) => item.source)),
        );
        console.log(`  links to add:          ${plan.linksToAdd.length}`);
        console.log(
            `  links to remove:       ${plan.linksToRemove.length}${prune ? '' : ' (without --prune: kept)'}`,
        );
        console.log('  tag source per question:', report.tagSources);
        printList('duplicate content keys (not written)', report.duplicateKeys);
        printList('questions without a content key', report.unresolvedKeyIds);
        printList(
            'game names missing from the catalog',
            report.unknownGameNames.map(
                (item) => `${item.name} ×${item.count}`,
            ),
        );
        printList('unknown tag refs', report.unknownRefs);
        printList(
            'published questions without tags',
            report.untaggedPublished.map(
                (item) => `${item.contentKey ?? '—'} (${item.id})`,
            ),
        );

        if (report.unknownRefs.length > 0) {
            throw new Error('Fix unknown tag refs before --apply.');
        }
        if (!apply) {
            console.log('Dry run. Add --apply to write.');
            return;
        }

        await client.query(
            `
                INSERT INTO "Domain" ("id", "nameRu", "nameEn")
                VALUES ($1, $2, $3)
                ON CONFLICT ("id") DO UPDATE
                SET "nameRu" = EXCLUDED."nameRu", "nameEn" = EXCLUDED."nameEn"
            `,
            [index.domain.id, index.domain.nameRu, index.domain.nameEn],
        );

        for (const facet of index.facets) {
            await client.query(
                `
                    INSERT INTO "Facet" ("id", "domainId", "slug", "nameRu", "nameEn", "sortOrder")
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT ("id") DO UPDATE
                    SET "nameRu" = EXCLUDED."nameRu",
                        "nameEn" = EXCLUDED."nameEn",
                        "sortOrder" = EXCLUDED."sortOrder"
                `,
                [
                    facet.id,
                    facet.domainId,
                    facet.slug,
                    facet.nameRu,
                    facet.nameEn,
                    facet.sortOrder,
                ],
            );
        }

        // Порядок плана: семейства раньше детей — FK parentId не падает.
        for (const part of chunks(plan.tagUpserts)) {
            await client.query(
                `
                    INSERT INTO "Tag" ("id", "facetId", "slug", "nameRu", "nameEn", "parentId", "sortOrder", "playOrder", "updatedAt")
                    SELECT v.id, v.facet_id, v.slug, v.name_ru, v.name_en, v.parent_id, v.sort_order, v.play_order, NOW()
                    FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::int[])
                        AS v(id, facet_id, slug, name_ru, name_en, parent_id, sort_order, play_order)
                    ON CONFLICT ("id") DO UPDATE
                    SET "nameRu" = EXCLUDED."nameRu",
                        "nameEn" = EXCLUDED."nameEn",
                        "parentId" = EXCLUDED."parentId",
                        "sortOrder" = EXCLUDED."sortOrder",
                        "playOrder" = EXCLUDED."playOrder",
                        "updatedAt" = NOW()
                `,
                [
                    part.map((tag) => tag.id),
                    part.map((tag) => tag.facetId),
                    part.map((tag) => tag.slug),
                    part.map((tag) => tag.nameRu),
                    part.map((tag) => tag.nameEn),
                    part.map((tag) => tag.parentId),
                    part.map((tag) => tag.sortOrder),
                    part.map((tag) => tag.playOrder),
                ],
            );
        }

        let keysWritten = 0;
        for (const part of chunks(plan.contentKeys)) {
            const result = await client.query(
                `
                    UPDATE "Question" q
                    SET "contentKey" = v.content_key
                    FROM unnest($1::text[], $2::text[]) AS v(id, content_key)
                    WHERE q."id" = v.id AND q."contentKey" IS NULL
                `,
                [
                    part.map((item) => item.questionId),
                    part.map((item) => item.contentKey),
                ],
            );
            keysWritten += result.rowCount ?? 0;
        }

        let linksAdded = 0;
        for (const part of chunks(plan.linksToAdd)) {
            const result = await client.query(
                `
                    INSERT INTO "QuestionTag" ("questionId", "tagId")
                    SELECT v.question_id, v.tag_id
                    FROM unnest($1::text[], $2::text[]) AS v(question_id, tag_id)
                    ON CONFLICT DO NOTHING
                `,
                [
                    part.map((link) => link.questionId),
                    part.map((link) => link.tagId),
                ],
            );
            linksAdded += result.rowCount ?? 0;
        }

        let linksRemoved = 0;
        for (const part of chunks(plan.linksToRemove)) {
            const result = await client.query(
                `
                    DELETE FROM "QuestionTag" qt
                    USING unnest($1::text[], $2::text[]) AS v(question_id, tag_id)
                    WHERE qt."questionId" = v.question_id AND qt."tagId" = v.tag_id
                `,
                [
                    part.map((link) => link.questionId),
                    part.map((link) => link.tagId),
                ],
            );
            linksRemoved += result.rowCount ?? 0;
        }

        console.log(
            `Applied: ${plan.tagUpserts.length} tags, ${keysWritten} content keys, +${linksAdded} / −${linksRemoved} links.`,
        );
    } finally {
        await client.end();
    }
}

function countBy(values: readonly string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const value of values) {
        counts[value] = (counts[value] ?? 0) + 1;
    }
    return counts;
}

function printList(title: string, items: readonly string[]): void {
    if (items.length === 0) {
        return;
    }
    console.log(`  ${title}: ${items.length}`);
    for (const item of items.slice(0, 30)) {
        console.log(`    ${item}`);
    }
    if (items.length > 30) {
        console.log(`    … and ${items.length - 30} more`);
    }
}

main().catch((error: unknown) => {
    console.error(
        'taxonomy-sync failed:',
        error instanceof Error ? error.message : error,
    );
    process.exit(1);
});
