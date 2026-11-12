/**
 * Проверка партии фактов без записи в БД.
 *
 * Ошибка (импорт нельзя): нарушен контракт или метки нет в каталоге
 * таксономии. Предупреждение (импорт можно, ревью решит): текст без точки
 * в конце и т. п. Сверка с вопросами («факт выдаёт ответ») — отдельно, в
 * `findFactAnswerHints`: ей нужны вопросы из БД.
 *
 * Canon: docs/DECISIONS.md → Did you know: trivia facts.
 */

import type { TaxonomyIndex } from '../taxonomy';
import {
    draftFactsBatchSchema,
    type DraftFact,
    type DraftFactsBatch,
} from './draft-facts.schema';

export type DraftFactsIssue = {
    /** Путь в файле: `facts[3].ru`. */
    path: string;
    message: string;
};

export type DraftFactsWarning = {
    key: string;
    message: string;
};

/** Факт партии с id метки в БД (`games.game.half-life-2`). */
export type ResolvedDraftFact = DraftFact & { tagId: string };

export type DraftFactsValidationResult =
    | {
          ok: true;
          batch: DraftFactsBatch;
          facts: ResolvedDraftFact[];
          warnings: DraftFactsWarning[];
      }
    | { ok: false; issues: DraftFactsIssue[] };

function pathToString(path: ReadonlyArray<string | number>): string {
    if (path.length === 0) {
        return '(root)';
    }
    return path
        .map((segment, index) =>
            typeof segment === 'number'
                ? `[${segment}]`
                : index === 0
                  ? segment
                  : `.${segment}`,
        )
        .join('');
}

const SENTENCE_END = /[.!?…»"')]$/;

export function validateDraftFactsBatch(
    input: unknown,
    index: TaxonomyIndex,
): DraftFactsValidationResult {
    const parsed = draftFactsBatchSchema.safeParse(input);
    if (!parsed.success) {
        return {
            ok: false,
            issues: parsed.error.issues.map((issue) => ({
                path: pathToString(issue.path),
                message: issue.message,
            })),
        };
    }

    const issues: DraftFactsIssue[] = [];
    const warnings: DraftFactsWarning[] = [];
    const facts: ResolvedDraftFact[] = [];

    parsed.data.facts.forEach((fact, position) => {
        const tagId = index.tagIdsByRef.get(fact.tag);
        if (!tagId) {
            issues.push({
                path: `facts[${position}].tag`,
                message: `Unknown tag "${fact.tag}" — add it to content/taxonomy/games.json`,
            });
            return;
        }
        facts.push({ ...fact, tagId });

        for (const [locale, text] of [
            ['RU', fact.ru],
            ['EN', fact.en],
        ] as const) {
            if (!SENTENCE_END.test(text)) {
                warnings.push({
                    key: fact.key,
                    message: `${locale} text does not end with a full stop`,
                });
            }
        }
    });

    if (issues.length > 0) {
        return { ok: false, issues };
    }
    return { ok: true, batch: parsed.data, facts, warnings };
}
