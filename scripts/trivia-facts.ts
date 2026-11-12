/**
 * CLI фактов «А ты знал?»: партия `content/drafts/facts/*.json` → dev / prod.
 *
 * Команды (npm run facts:<команда> -- …):
 *   validate  --file=<batch>                     контракт и метки, без БД
 *   review    --file=<batch> [--out=<html>]      HTML для владельца: факты,
 *             вопросы той же игры / серии, «факт выдаёт ответ» (читает БД)
 *   import    --file=<batch> [--apply]           черновики: upsert по ключу,
 *             публикация не меняется
 *   publish   --file=<batch> [--keys=a,b] [--apply]   опубликовать черновики
 *   unpublish --keys=a,b [--apply]               снять с показа
 *   coverage  [--top=40]                         доля вопросов с фактом и
 *             кандидаты на следующую партию
 *
 * Без `--apply` — только план. `--target=prod` — PROD_DATABASE_URL_UNPOOLED,
 * только по команде владельца. Запись — отдельные autocommit-запросы без
 * BEGIN, каждый идемпотентен (Neon write path): повтор доводит начатое.
 * Приложение эти таблицы только читает.
 *
 * Canon: docs/DECISIONS.md → Did you know: trivia facts;
 * docs/CONTENT_PIPELINE.md §12.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

import { Client } from 'pg';

import {
    TRIVIA_FACT_MAX_LENGTH,
    findFactAnswerHints,
    validateDraftFactsBatch,
    type FactAnswerHint,
    type FactHintQuestion,
    type ResolvedDraftFact,
} from '../src/features/content/facts';
import {
    buildTaxonomyIndex,
    refForGameName,
    type TaxonomyIndex,
} from '../src/features/content/taxonomy';
import { loadTaxonomyCatalog } from '../src/features/content/taxonomy/load-taxonomy-files';

const REVIEW_DIR = 'content/drafts/facts/_review';

type Target = 'dev' | 'prod';

type Args = {
    command: string;
    file: string | null;
    out: string | null;
    keys: string[] | null;
    top: number;
    apply: boolean;
    target: Target;
};

function parseArgs(argv: string[]): Args {
    const value = (name: string) =>
        argv
            .find((arg) => arg.startsWith(`--${name}=`))
            ?.slice(name.length + 3) ?? null;
    const keys = value('keys');
    return {
        command: argv.find((arg) => !arg.startsWith('--')) ?? '',
        file: value('file'),
        out: value('out'),
        keys: keys
            ? keys
                  .split(',')
                  .map((key) => key.trim())
                  .filter(Boolean)
            : null,
        top: Number(value('top') ?? 40) || 40,
        apply: argv.includes('--apply'),
        target: argv.includes('--target=prod') ? 'prod' : 'dev',
    };
}

/* ── env и подключение ──────────────────────────────────────────────── */

function loadEnvFile(fileName: string): void {
    const filePath = resolve(process.cwd(), fileName);
    if (!existsSync(filePath)) {
        return;
    }
    for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match || match[1] in process.env) {
            continue;
        }
        process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
    }
}

/** Neon endpoint без суффикса `-pooler`: pooled и unpooled URL одной базы равны. */
function endpointOf(url: string): string {
    try {
        return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '');
    } catch {
        return '';
    }
}

/**
 * dev — DATABASE_URL_UNPOOLED, prod — PROD_DATABASE_URL_UNPOOLED. Обе
 * стороны сверяются: dev-команда не должна попасть в прод из-за
 * подменённого env, и наоборот.
 */
function connectionFor(target: Target): string {
    const devUrl =
        process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '';
    const prodUrl = process.env.PROD_DATABASE_URL_UNPOOLED ?? '';
    const sameEndpoint =
        devUrl !== '' &&
        prodUrl !== '' &&
        endpointOf(devUrl) === endpointOf(prodUrl);

    if (target === 'prod') {
        if (!prodUrl) {
            throw new Error('PROD_DATABASE_URL_UNPOOLED is required for --target=prod');
        }
        if (sameEndpoint) {
            throw new Error('PROD_DATABASE_URL_UNPOOLED points at the dev database');
        }
        return prodUrl;
    }
    if (!devUrl) {
        throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required');
    }
    if (sameEndpoint) {
        throw new Error(
            'DATABASE_URL_UNPOOLED points at prod — use --target=prod on purpose',
        );
    }
    return devUrl;
}

async function withDb<T>(
    target: Target,
    work: (client: Client) => Promise<T>,
): Promise<T> {
    const client = new Client({
        connectionString: connectionFor(target),
        connectionTimeoutMillis: 20_000,
    });
    client.on('error', () => undefined);
    await client.connect();
    try {
        return await work(client);
    } finally {
        await client.end();
    }
}

/* ── партия ─────────────────────────────────────────────────────────── */

function loadBatch(
    fileRel: string | null,
    index: TaxonomyIndex,
): { file: string; facts: ResolvedDraftFact[] } {
    if (!fileRel) {
        throw new Error('--file=<content/drafts/facts/…json> is required');
    }
    const file = resolve(process.cwd(), fileRel);
    if (!existsSync(file)) {
        throw new Error(`File not found: ${fileRel}`);
    }
    const result = validateDraftFactsBatch(
        JSON.parse(readFileSync(file, 'utf8')),
        index,
    );
    if (!result.ok) {
        console.error(`Batch ${fileRel}: ${result.issues.length} error(s)`);
        for (const issue of result.issues) {
            console.error(`  - ${issue.path}: ${issue.message}`);
        }
        process.exit(1);
    }
    for (const warning of result.warnings) {
        console.log(`  ! [${warning.key}] ${warning.message}`);
    }
    return { file, facts: result.facts };
}

type FactRow = {
    contentKey: string;
    tagId: string;
    textRu: string;
    textEn: string;
    sourceUrl: string;
    publishedAt: Date | null;
};

const FACT_COLUMNS = `"contentKey", "tagId", "textRu", "textEn", "sourceUrl", "publishedAt"`;

async function factsByKey(
    client: Client,
    keys: readonly string[],
): Promise<Map<string, FactRow>> {
    const { rows } = await client.query<FactRow>(
        `SELECT ${FACT_COLUMNS} FROM "TriviaFact" WHERE "contentKey" = ANY($1::text[])`,
        [keys],
    );
    return new Map(rows.map((row) => [row.contentKey, row]));
}

function sameAsFile(row: FactRow, fact: ResolvedDraftFact): boolean {
    return (
        row.tagId === fact.tagId &&
        row.textRu === fact.ru &&
        row.textEn === fact.en &&
        row.sourceUrl === fact.source
    );
}

async function missingTags(
    client: Client,
    tagIds: readonly string[],
): Promise<string[]> {
    const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM "Tag" WHERE id = ANY($1::text[])`,
        [[...new Set(tagIds)]],
    );
    const present = new Set(rows.map((row) => row.id));
    return [...new Set(tagIds)].filter((id) => !present.has(id));
}

function short(text: string, max = 70): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function planFooter(args: Args): void {
    console.log(
        args.apply
            ? 'Done.'
            : 'Plan only. Add --apply to write' +
                  (args.target === 'prod' ? ' (prod: owner’s go-ahead).' : '.'),
    );
}

/* ── validate ───────────────────────────────────────────────────────── */

function runValidate(args: Args, index: TaxonomyIndex): void {
    const { facts } = loadBatch(args.file, index);
    const games = new Set(
        facts.filter((f) => f.tag.startsWith('game:')).map((f) => f.tag),
    );
    const series = new Set(
        facts.filter((f) => f.tag.startsWith('franchise:')).map((f) => f.tag),
    );
    console.log(
        `OK: ${facts.length} facts — ${games.size} games, ${series.size} series.`,
    );
}

/* ── review ─────────────────────────────────────────────────────────── */

type ReviewQuestion = FactHintQuestion & {
    type: string;
    difficulty: string;
    answerRu: string;
    answerEn: string;
};

type ReviewTag = { id: string; nameRu: string; nameEn: string; facet: string };

async function loadReviewQuestions(
    client: Client,
    tagIds: readonly string[],
): Promise<Map<string, ReviewQuestion[]>> {
    const { rows: questions } = await client.query<{
        tagId: string;
        id: string;
        contentKey: string | null;
        type: string;
        difficulty: string;
        textRu: string;
    }>(
        `SELECT qt."tagId", q.id, q."contentKey", q.type::text AS type,
                q.difficulty::text AS difficulty, COALESCE(tr.text, q.text) AS "textRu"
         FROM "QuestionTag" qt
         JOIN "Question" q ON q.id = qt."questionId"
         LEFT JOIN "QuestionTranslation" tr
                ON tr."questionId" = q.id AND tr.locale = 'ru'
         WHERE qt."tagId" = ANY($1::text[])
           AND q."publicationStatus" = 'PUBLISHED' AND q."isActive"
         ORDER BY q.difficulty, q."contentKey"`,
        [tagIds],
    );

    const questionIds = [...new Set(questions.map((row) => row.id))];
    const { rows: options } = await client.query<{
        questionId: string;
        text: string;
        locale: string | null;
        trText: string | null;
    }>(
        `SELECT o."questionId", o.text, t.locale::text AS locale, t.text AS "trText"
         FROM "AnswerOption" o
         LEFT JOIN "AnswerOptionTranslation" t ON t."optionId" = o.id
         WHERE o."isCorrect" AND o."questionId" = ANY($1::text[])`,
        [questionIds],
    );

    const answers = new Map<string, { ru: string; en: string; all: Set<string> }>();
    for (const option of options) {
        const entry = answers.get(option.questionId) ?? {
            ru: option.text,
            en: '',
            all: new Set<string>([option.text]),
        };
        if (option.trText) {
            entry.all.add(option.trText);
            if (option.locale === 'ru') entry.ru = option.trText;
            if (option.locale === 'en') entry.en = option.trText;
        }
        answers.set(option.questionId, entry);
    }

    const byTag = new Map<string, ReviewQuestion[]>();
    for (const row of questions) {
        const answer = answers.get(row.id);
        const list = byTag.get(row.tagId) ?? [];
        list.push({
            ref: row.contentKey ?? row.id,
            textRu: row.textRu,
            answers: answer ? [...answer.all] : [],
            type: row.type,
            difficulty: row.difficulty,
            answerRu: answer?.ru ?? '',
            answerEn: answer?.en ?? '',
        });
        byTag.set(row.tagId, list);
    }
    return byTag;
}

const escapeHtml = (text: string) =>
    text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

type ReviewItem = {
    fact: ResolvedDraftFact;
    status: 'new' | 'draft' | 'published' | 'changed';
    tag: ReviewTag | null;
    questions: ReviewQuestion[];
    hints: FactAnswerHint[];
    otherFacts: FactRow[];
};

const STATUS_LABEL: Record<ReviewItem['status'], string> = {
    new: 'новый',
    draft: 'черновик в базе',
    published: 'опубликован',
    changed: 'в базе другой текст',
};

function renderReview(
    batchName: string,
    target: Target,
    items: ReviewItem[],
): string {
    const hintCount = items.filter((item) => item.hints.length > 0).length;
    const tagCount = new Set(items.map((item) => item.fact.tagId)).size;

    const cards = items
        .map((item) => {
            const { fact } = item;
            const tagName = item.tag
                ? `${item.tag.nameRu}${item.tag.nameEn !== item.tag.nameRu ? ` · ${item.tag.nameEn}` : ''}`
                : fact.tag;
            const facet = fact.tag.startsWith('game:') ? 'игра' : 'серия';
            const host = new URL(fact.source).hostname.replace(/^www\./, '');
            const warnings = [
                ...(item.tag
                    ? []
                    : ['Метки нет в этой базе — сначала taxonomy:sync.']),
                ...item.hints.map(
                    (hint) =>
                        `Подсказывает ответ: «${hint.match}» (ответ «${hint.answer}») на вопрос: ${hint.question.textRu}`,
                ),
            ];
            const questions = item.questions
                .map(
                    (q) =>
                        `<li><span class="meta">${escapeHtml(q.difficulty)} · ${escapeHtml(q.type)}</span> ${escapeHtml(q.textRu)} — <b class="ok">${escapeHtml(q.answerRu)}</b>${q.answerEn && q.answerEn !== q.answerRu ? ` <span class="en">${escapeHtml(q.answerEn)}</span>` : ''}</li>`,
                )
                .join('');
            const others = item.otherFacts
                .map(
                    (other) =>
                        `<li>${escapeHtml(other.textRu)} <span class="meta">${escapeHtml(other.contentKey)}${other.publishedAt ? ' · опубликован' : ''}</span></li>`,
                )
                .join('');
            return `
<article class="card${warnings.length > 0 ? ' warn' : ''}">
  <header><span class="tag">${escapeHtml(facet)}: ${escapeHtml(tagName)}</span>
    <span class="status s-${item.status}">${STATUS_LABEL[item.status]}</span></header>
  <p class="ru">${escapeHtml(fact.ru)}</p>
  <p class="en">${escapeHtml(fact.en)}</p>
  <p class="meta">${escapeHtml(fact.key)} · RU ${fact.ru.length} / EN ${fact.en.length} из ${TRIVIA_FACT_MAX_LENGTH} ·
    <a href="${escapeHtml(fact.source)}" target="_blank" rel="noreferrer">${escapeHtml(host)}</a></p>
  ${warnings.map((w) => `<p class="alert">${escapeHtml(w)}</p>`).join('')}
  ${others ? `<details><summary>Другие факты на этой метке (${item.otherFacts.length})</summary><ul>${others}</ul></details>` : ''}
  <details><summary>Вопросы с этой меткой (${item.questions.length})</summary>${questions ? `<ul>${questions}</ul>` : '<p class="meta">Опубликованных вопросов нет.</p>'}</details>
</article>`;
        })
        .join('\n');

    return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Факты: ${escapeHtml(batchName)}</title>
<style>
:root { --bg:#f6f7f9; --card:#fff; --text:#16191f; --muted:#6b7280; --line:#e5e7eb;
  --ok:#15803d; --bad:#b91c1c; --bad-bg:#fef2f2; --accent:#2563eb; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f1115; --card:#181b21; --text:#e8eaee;
  --muted:#9aa1ad; --line:#2a2f38; --ok:#4ade80; --bad:#f87171; --bad-bg:#2a1414; --accent:#60a5fa; } }
* { box-sizing:border-box; }
body { margin:0; padding:24px 16px 48px; background:var(--bg); color:var(--text);
  font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width:760px; margin:0 auto; }
h1 { font-size:22px; margin:0 0 4px; }
.summary { color:var(--muted); margin:0 0 20px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin:0 0 12px; }
.card.warn { border-color:var(--bad); }
.card header { display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; font-size:13px; }
.tag { font-weight:600; }
.status { color:var(--muted); }
.s-changed, .s-published { color:var(--accent); }
.ru { font-size:17px; margin:10px 0 4px; }
.en { color:var(--muted); margin:0 0 8px; }
.meta { color:var(--muted); font-size:13px; margin:0; }
.alert { background:var(--bad-bg); color:var(--bad); border-radius:8px; padding:6px 10px; margin:8px 0 0; font-size:14px; }
.ok { color:var(--ok); font-weight:600; }
details { margin-top:8px; font-size:14px; }
summary { cursor:pointer; color:var(--muted); }
ul { padding-left:18px; margin:6px 0 0; }
li { margin:4px 0; }
a { color:var(--accent); }
</style></head>
<body><main>
<h1>Факты «А ты знал?» — ${escapeHtml(batchName)}</h1>
<p class="summary">${items.length} фактов · ${tagCount} игр и серий · с подсказкой ответа: ${hintCount} · база: ${target} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
${cards}
</main></body></html>
`;
}

async function runReview(args: Args, index: TaxonomyIndex): Promise<void> {
    const { file, facts } = loadBatch(args.file, index);
    const tagIds = [...new Set(facts.map((fact) => fact.tagId))];
    // Название игры или серии ответом не считается (см. find-fact-answer-hints).
    const isTitle = (answer: string) => refForGameName(index, answer) !== null;

    const items = await withDb(args.target, async (client) => {
        const { rows: tags } = await client.query<ReviewTag>(
            `SELECT t.id, t."nameRu", t."nameEn", f.slug AS facet
             FROM "Tag" t JOIN "Facet" f ON f.id = t."facetId"
             WHERE t.id = ANY($1::text[])`,
            [tagIds],
        );
        const tagById = new Map(tags.map((tag) => [tag.id, tag]));
        const questionsByTag = await loadReviewQuestions(client, tagIds);
        const keys = facts.map((fact) => fact.key);
        const { rows: stored } = await client.query<FactRow>(
            `SELECT ${FACT_COLUMNS} FROM "TriviaFact"
             WHERE "contentKey" = ANY($1::text[]) OR "tagId" = ANY($2::text[])`,
            [keys, tagIds],
        );
        const storedByKey = new Map(stored.map((row) => [row.contentKey, row]));
        const batchKeys = new Set(keys);

        return facts.map((fact): ReviewItem => {
            const row = storedByKey.get(fact.key);
            const questions = questionsByTag.get(fact.tagId) ?? [];
            return {
                fact,
                status: !row
                    ? 'new'
                    : !sameAsFile(row, fact)
                      ? 'changed'
                      : row.publishedAt
                        ? 'published'
                        : 'draft',
                tag: tagById.get(fact.tagId) ?? null,
                questions,
                hints: findFactAnswerHints(fact, questions, {
                    ignoreAnswer: isTitle,
                }),
                otherFacts: stored.filter(
                    (other) =>
                        other.tagId === fact.tagId &&
                        !batchKeys.has(other.contentKey),
                ),
            };
        });
    });

    const batchName = basename(file, '.json');
    const out = resolve(
        process.cwd(),
        args.out ?? `${REVIEW_DIR}/${batchName}.html`,
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderReview(batchName, args.target, items), 'utf8');

    const withHints = items.filter((item) => item.hints.length > 0);
    console.log(
        `Review: ${relative(process.cwd(), out)} — ${items.length} facts, ${withHints.length} with an answer hint.`,
    );
    for (const item of withHints) {
        for (const hint of item.hints) {
            console.log(
                `  ! [${item.fact.key}] «${hint.match}» (answer «${short(hint.answer, 40)}») — ${short(hint.question.textRu)}`,
            );
        }
    }
}

/* ── import ─────────────────────────────────────────────────────────── */

async function runImport(args: Args, index: TaxonomyIndex): Promise<void> {
    const { facts } = loadBatch(args.file, index);

    await withDb(args.target, async (client) => {
        const missing = await missingTags(
            client,
            facts.map((fact) => fact.tagId),
        );
        if (missing.length > 0) {
            console.error(
                `Tags missing in ${args.target} DB (run taxonomy:sync first): ${missing.join(', ')}`,
            );
            process.exit(1);
        }

        const stored = await factsByKey(
            client,
            facts.map((fact) => fact.key),
        );
        const fresh = facts.filter((fact) => !stored.has(fact.key));
        const changed = facts.filter((fact) => {
            const row = stored.get(fact.key);
            return row !== undefined && !sameAsFile(row, fact);
        });
        const liveChanged = changed.filter(
            (fact) => stored.get(fact.key)?.publishedAt,
        );

        console.log(
            `Import → ${args.target}: ${fresh.length} new, ${changed.length} changed (${liveChanged.length} live), ${facts.length - fresh.length - changed.length} unchanged.`,
        );
        for (const fact of fresh) console.log(`  + ${fact.key}  ${short(fact.ru)}`);
        for (const fact of changed) {
            const live = stored.get(fact.key)?.publishedAt ? ' [live]' : '';
            console.log(`  ~ ${fact.key}${live}  ${short(fact.ru)}`);
        }

        const rows = [...fresh, ...changed];
        if (!args.apply || rows.length === 0) {
            return;
        }
        const { rowCount } = await client.query(
            `INSERT INTO "TriviaFact"
               ("id", "contentKey", "tagId", "textRu", "textEn", "sourceUrl", "createdAt", "updatedAt")
             SELECT x.id, x.key, x.tag, x.ru, x.en, x.src, now(), now()
             FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
                  AS x(id, key, tag, ru, en, src)
             ON CONFLICT ("contentKey") DO UPDATE SET
               "tagId" = EXCLUDED."tagId", "textRu" = EXCLUDED."textRu",
               "textEn" = EXCLUDED."textEn", "sourceUrl" = EXCLUDED."sourceUrl",
               "updatedAt" = now()
             WHERE ("TriviaFact"."tagId", "TriviaFact"."textRu", "TriviaFact"."textEn", "TriviaFact"."sourceUrl")
                   IS DISTINCT FROM
                   (EXCLUDED."tagId", EXCLUDED."textRu", EXCLUDED."textEn", EXCLUDED."sourceUrl")`,
            [
                rows.map(() => randomUUID()),
                rows.map((fact) => fact.key),
                rows.map((fact) => fact.tagId),
                rows.map((fact) => fact.ru),
                rows.map((fact) => fact.en),
                rows.map((fact) => fact.source),
            ],
        );
        console.log(`Written: ${rowCount ?? 0} row(s).`);
    });
    planFooter(args);
}

/* ── publish / unpublish ────────────────────────────────────────────── */

async function runPublish(args: Args, index: TaxonomyIndex): Promise<void> {
    const { facts } = loadBatch(args.file, index);
    const fileKeys = new Set(facts.map((fact) => fact.key));
    const unknown = (args.keys ?? []).filter((key) => !fileKeys.has(key));
    if (unknown.length > 0) {
        throw new Error(`--keys not in this file: ${unknown.join(', ')}`);
    }
    const chosen = args.keys
        ? facts.filter((fact) => args.keys?.includes(fact.key))
        : facts;

    await withDb(args.target, async (client) => {
        const stored = await factsByKey(
            client,
            chosen.map((fact) => fact.key),
        );
        const notImported = chosen.filter((fact) => !stored.has(fact.key));
        const stale = chosen.filter((fact) => {
            const row = stored.get(fact.key);
            return row !== undefined && !sameAsFile(row, fact);
        });
        if (notImported.length > 0 || stale.length > 0) {
            for (const fact of notImported) console.error(`  - not imported: ${fact.key}`);
            for (const fact of stale) console.error(`  - DB text differs from the file: ${fact.key}`);
            console.error('Run facts:import first — publish takes exactly what was reviewed.');
            process.exit(1);
        }

        const drafts = chosen.filter((fact) => !stored.get(fact.key)?.publishedAt);
        console.log(
            `Publish → ${args.target}: ${drafts.length} to publish, ${chosen.length - drafts.length} already live.`,
        );
        for (const fact of drafts) console.log(`  + ${fact.key}  ${short(fact.ru)}`);

        if (!args.apply || drafts.length === 0) {
            return;
        }
        const { rowCount } = await client.query(
            `UPDATE "TriviaFact" SET "publishedAt" = now(), "updatedAt" = now()
             WHERE "contentKey" = ANY($1::text[]) AND "publishedAt" IS NULL`,
            [drafts.map((fact) => fact.key)],
        );
        console.log(`Published: ${rowCount ?? 0}.`);
    });
    planFooter(args);
}

async function runUnpublish(args: Args): Promise<void> {
    if (!args.keys || args.keys.length === 0) {
        throw new Error('--keys=fact-a,fact-b is required');
    }
    const keys = args.keys;

    await withDb(args.target, async (client) => {
        const stored = await factsByKey(client, keys);
        const unknown = keys.filter((key) => !stored.has(key));
        const live = keys.filter((key) => stored.get(key)?.publishedAt);
        console.log(
            `Unpublish → ${args.target}: ${live.length} live, ${keys.length - live.length - unknown.length} already hidden, ${unknown.length} not found.`,
        );
        for (const key of live) console.log(`  - ${key}  ${short(stored.get(key)?.textRu ?? '')}`);
        for (const key of unknown) console.log(`  ? ${key} (no such fact)`);

        if (!args.apply || live.length === 0) {
            return;
        }
        const { rowCount } = await client.query(
            `UPDATE "TriviaFact" SET "publishedAt" = NULL, "updatedAt" = now()
             WHERE "contentKey" = ANY($1::text[]) AND "publishedAt" IS NOT NULL`,
            [live],
        );
        console.log(`Hidden: ${rowCount ?? 0}.`);
    });
    planFooter(args);
}

/* ── coverage ───────────────────────────────────────────────────────── */

/** Опубликованные вопросы и их метки игры / серии. */
const QUESTION_TAGS_CTE = `
  p AS (
    SELECT id FROM "Question"
    WHERE "publicationStatus" = 'PUBLISHED' AND "isActive"
  ),
  qt AS (
    SELECT qt."questionId", qt."tagId"
    FROM "QuestionTag" qt
    JOIN p ON p.id = qt."questionId"
    JOIN "Tag" t ON t.id = qt."tagId"
    JOIN "Facet" f ON f.id = t."facetId"
    WHERE f.slug IN ('game', 'franchise')
  )`;

async function runCoverage(args: Args): Promise<void> {
    await withDb(args.target, async (client) => {
        const { rows: totals } = await client.query<{
            facts: number;
            published: number;
        }>(
            `SELECT count(*)::int AS facts, count("publishedAt")::int AS published
             FROM "TriviaFact"`,
        );
        const { rows: coverage } = await client.query<{
            questions: number;
            live: number;
            withDrafts: number;
        }>(
            `WITH ${QUESTION_TAGS_CTE},
             facts AS (
               SELECT "tagId", bool_or("publishedAt" IS NOT NULL) AS live
               FROM "TriviaFact" GROUP BY "tagId"
             )
             SELECT (SELECT count(*) FROM p)::int AS questions,
                    count(DISTINCT qt."questionId") FILTER (WHERE facts.live)::int AS live,
                    count(DISTINCT qt."questionId") FILTER (WHERE facts."tagId" IS NOT NULL)::int AS "withDrafts"
             FROM qt LEFT JOIN facts ON facts."tagId" = qt."tagId"`,
        );
        const { rows: candidates } = await client.query<{
            tag: string;
            name: string;
            questions: number;
        }>(
            `WITH ${QUESTION_TAGS_CTE}
             SELECT t.id AS tag, t."nameEn" AS name, count(*)::int AS questions
             FROM qt JOIN "Tag" t ON t.id = qt."tagId"
             WHERE NOT EXISTS (SELECT 1 FROM "TriviaFact" tf WHERE tf."tagId" = t.id)
             GROUP BY t.id, t."nameEn"
             ORDER BY questions DESC, name
             LIMIT $1`,
            [args.top],
        );

        const total = totals[0];
        const cover = coverage[0];
        const pct = (n: number) =>
            cover.questions === 0 ? 0 : Math.round((100 * n) / cover.questions);
        console.log(`Facts in ${args.target}: ${total.facts} (${total.published} published).`);
        console.log(
            `Published questions with a live fact: ${cover.live} of ${cover.questions} (${pct(cover.live)}%); counting drafts: ${cover.withDrafts} (${pct(cover.withDrafts)}%).`,
        );
        console.log(`\nTop ${args.top} games / series without facts (next batch):`);
        console.table(
            candidates.map((row) => ({
                ref: row.tag.replace(/^[^.]+\.(game|franchise)\./, '$1:'),
                name: row.name,
                questions: row.questions,
            })),
        );
    });
}

/* ── main ───────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
    loadEnvFile('.env');
    const args = parseArgs(process.argv.slice(2));
    const index = buildTaxonomyIndex(loadTaxonomyCatalog(process.cwd()));

    switch (args.command) {
        case 'validate':
            return runValidate(args, index);
        case 'review':
            return runReview(args, index);
        case 'import':
            return runImport(args, index);
        case 'publish':
            return runPublish(args, index);
        case 'unpublish':
            return runUnpublish(args);
        case 'coverage':
            return runCoverage(args);
        default:
            throw new Error(
                'Usage: tsx scripts/trivia-facts.ts <validate|review|import|publish|unpublish|coverage> [--file=…] [--keys=…] [--apply] [--target=prod]',
            );
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
