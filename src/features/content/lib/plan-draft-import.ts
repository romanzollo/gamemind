/**
 * План импорта партии: какие вопросы создать, какие уже есть в целевой БД.
 *
 * Зачем: импорт должен переживать обрыв сети посередине — повторный запуск
 * той же команды догружает недостающее и не плодит дубли. Чистая функция:
 * импорт читает строки из БД и зовёт план, тесты проверяют план без Neon.
 *
 * «Уже есть», первое совпадение побеждает:
 * 1. `contentKey` строки = `draftKey` черновика. Импорт пишет ключ при
 *    создании, `taxonomy:sync` — для старых строк. Ловит и вопрос, чей текст
 *    после импорта поправили через `content/fixes`.
 * 2. Тот же RU-текст (`normalizeQuestionText`, как в таксономии) — строки,
 *    которым ключ ещё не поставили. Если у строки другой ключ, это дубль
 *    вопроса из другой партии: не создаём, но помечаем отдельно, чтобы
 *    поправить партию.
 *
 * Canon: docs/DECISIONS.md → Draft import is re-runnable.
 */

import { normalizeQuestionText } from '@/features/content/taxonomy/content-key';

export type DraftImportCandidate = {
    index: number;
    draftKey?: string;
    ruText: string;
};

export type ExistingImportRow = {
    id: string;
    contentKey: string | null;
    ruText: string | null;
};

export type DraftImportSkipReason =
    /** Строка с `contentKey = draftKey` уже есть. */
    | 'content-key'
    /** Тот же RU-текст у строки без ключа (или черновик без draftKey). */
    | 'text'
    /** Тот же RU-текст у строки с другим ключом — дубль из другой партии. */
    | 'text-other-key';

export type DraftImportDecision =
    | { index: number; draftKey?: string; action: 'create' }
    | {
          index: number;
          draftKey?: string;
          action: 'skip';
          reason: DraftImportSkipReason;
          existingId: string;
          existingContentKey: string | null;
      };

export function planDraftImport(
    candidates: readonly DraftImportCandidate[],
    existing: readonly ExistingImportRow[],
): DraftImportDecision[] {
    const byKey = new Map<string, ExistingImportRow>();
    const byText = new Map<string, ExistingImportRow>();
    for (const row of existing) {
        if (row.contentKey) {
            byKey.set(row.contentKey, row);
        }
        if (row.ruText) {
            const text = normalizeQuestionText(row.ruText);
            // При нескольких строках с одним текстом предпочитаем строку
            // без ключа: она скорее всего и есть «наш» вопрос.
            const current = byText.get(text);
            if (!current || (current.contentKey && !row.contentKey)) {
                byText.set(text, row);
            }
        }
    }

    return candidates.map((candidate) => {
        const base = { index: candidate.index, draftKey: candidate.draftKey };

        const keyRow = candidate.draftKey
            ? byKey.get(candidate.draftKey)
            : undefined;
        if (keyRow) {
            return {
                ...base,
                action: 'skip',
                reason: 'content-key',
                existingId: keyRow.id,
                existingContentKey: keyRow.contentKey,
            };
        }

        const textRow = byText.get(normalizeQuestionText(candidate.ruText));
        if (textRow) {
            const otherKey =
                candidate.draftKey !== undefined &&
                textRow.contentKey !== null &&
                textRow.contentKey !== candidate.draftKey;
            return {
                ...base,
                action: 'skip',
                reason: otherKey ? 'text-other-key' : 'text',
                existingId: textRow.id,
                existingContentKey: textRow.contentKey,
            };
        }

        return { ...base, action: 'create' };
    });
}
