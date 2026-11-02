/**
 * Чтение каталога таксономии, черновиков и правок с диска.
 *
 * Только для CLI-скриптов (`scripts/taxonomy-*.ts`) и тестов: использует
 * node:fs. Из приложения не импортировать — каталог в рантайме живёт в БД.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    questionOverridesSchema,
    taxonomyCatalogSchema,
    type QuestionOverrides,
    type TaxonomyCatalog,
} from './taxonomy-catalog.schema';

export const TAXONOMY_CATALOG_PATH = 'content/taxonomy/games.json';
export const TAXONOMY_OVERRIDES_PATH =
    'content/taxonomy/question-overrides.json';
export const DRAFT_BATCHES_DIR = 'content/drafts/batches';
export const CONTENT_FIXES_DIR = 'content/fixes';

/** Вопрос черновика в объёме, нужном таксономии. */
export type DraftQuestionLike = {
    draftKey?: string;
    type: string;
    translations: { ru: { text: string } };
    metadata?: Record<string, unknown>;
    tags?: string[];
};

export type DraftBatchFile = { file: string; questions: DraftQuestionLike[] };

export type FixFile = {
    fixes: Array<{ matchQuestionRu?: string; question?: { ru?: string } }>;
};

function readJson(path: string): unknown {
    return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadTaxonomyCatalog(root: string): TaxonomyCatalog {
    return taxonomyCatalogSchema.parse(
        readJson(join(root, TAXONOMY_CATALOG_PATH)),
    );
}

export function loadQuestionOverrides(root: string): QuestionOverrides {
    return questionOverridesSchema.parse(
        readJson(join(root, TAXONOMY_OVERRIDES_PATH)),
    );
}

function listJson(dir: string): string[] {
    return readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .sort();
}

export function loadDraftBatches(root: string): DraftBatchFile[] {
    const dir = join(root, DRAFT_BATCHES_DIR);
    return listJson(dir).map((file) => ({
        file,
        questions: (
            readJson(join(dir, file)) as { questions: DraftQuestionLike[] }
        ).questions,
    }));
}

export function loadFixFiles(root: string): FixFile[] {
    const dir = join(root, CONTENT_FIXES_DIR);
    return listJson(dir).map((file) => readJson(join(dir, file)) as FixFile);
}
