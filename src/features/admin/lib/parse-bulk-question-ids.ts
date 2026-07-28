/**
 * Нормализация id для admin bulk isActive (deactivate / activate).
 *
 * Зачем отдельный pure-модуль:
 * - FormData / checkbox values — внешний вход; чистим до repository;
 * - одинаковые правила в Server Action и в SQL-слое (cap, unique, trim);
 * - легко unit-тестировать без Neon (см. docs/TESTING.md).
 *
 * Не путать с publication bulk (его нет) и с single-item `questionId`.
 */

/** Имя поля checkbox / FormData для выбранных вопросов. */
export const BULK_QUESTION_IDS_FIELD = 'questionIds';

/**
 * Верхний предел id за один bulk-запрос.
 * UI списка обычно десятки строк; 100 — запас + защита от злоупотребления.
 */
export const BULK_QUESTION_IDS_MAX = 100;

/**
 * Trim → drop empty → unique (порядок первого вхождения) → cap.
 * Не проверяет «существует ли id в БД» — это работа repository/SQL.
 */
export function normalizeBulkQuestionIds(
    ids: readonly string[],
): string[] {
    const unique: string[] = [];
    const seen = new Set<string>();

    for (const raw of ids) {
        const id = raw.trim();
        if (id === '' || seen.has(id)) {
            continue;
        }
        seen.add(id);
        unique.push(id);
        if (unique.length >= BULK_QUESTION_IDS_MAX) {
            break;
        }
    }

    return unique;
}

/**
 * Достаёт выбранные id из FormData (несколько checkbox с одним name).
 * Нестроковые значения (File и т.п.) отбрасываем.
 */
export function parseBulkQuestionIdsFromFormData(
    formData: FormData,
): string[] {
    const raw = formData.getAll(BULK_QUESTION_IDS_FIELD);
    const asStrings: string[] = [];

    for (const value of raw) {
        if (typeof value === 'string') {
            asStrings.push(value);
        }
    }

    return normalizeBulkQuestionIds(asStrings);
}
