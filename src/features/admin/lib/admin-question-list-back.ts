/**
 * Возврат в то же место списка вопросов (фильтры + страница) из редактора
 * и после действий в строке.
 *
 * Контракт: по ссылкам и формам ездит только query списка (`back`), а не
 * готовый адрес. Сервер прогоняет его через parseAdminQuestionListFilters
 * и собирает путь сам из локали и константы `/admin/questions`. Поэтому
 * подставить чужой домен или другой раздел нельзя (open redirect), а битые
 * значения просто дают список по умолчанию.
 *
 * Чистая логика без React/сервера — можно звать и из Server Actions,
 * и из Client-компонентов.
 */

import {
    buildAdminQuestionListQuery,
    parseAdminQuestionListFilters,
} from '@/features/admin/lib/parse-admin-question-list-filters';

/** Имя query/FormData-параметра с query списка. */
export const ADMIN_QUESTION_LIST_BACK_PARAM = 'back';

/** Длиннее нормального query (q ≤ 200 символов) — мусор, не разбираем. */
const BACK_MAX_LENGTH = 1000;

/**
 * Сырое значение `back` (URL или FormData) → нормализованный query списка.
 * Всё непонятное → '' (список по умолчанию).
 */
export function parseAdminQuestionListBack(raw: unknown): string {
    const value = Array.isArray(raw) ? raw[0] : raw;

    if (typeof value !== 'string' || value.length > BACK_MAX_LENGTH) {
        return '';
    }

    const params = new URLSearchParams(
        value.startsWith('?') ? value.slice(1) : value,
    );
    const filters = parseAdminQuestionListFilters(
        Object.fromEntries(params.entries()),
    );

    return buildAdminQuestionListQuery(filters);
}

/** Путь списка с фильтрами из `back` (только наш раздел, только наша локаль). */
export function buildAdminQuestionListHrefFromBack(
    locale: string,
    rawBack: unknown,
): string {
    const query = parseAdminQuestionListBack(rawBack);
    const base = `/${locale}/admin/questions`;

    return query ? `${base}?${query}` : base;
}

/** Ссылка на редактор, которая помнит, откуда пришли. */
export function buildAdminQuestionEditHref(
    locale: string,
    questionId: string,
    back: string,
): string {
    const base = `/${locale}/admin/questions/${encodeURIComponent(questionId)}/edit`;

    return back
        ? `${base}?${ADMIN_QUESTION_LIST_BACK_PARAM}=${encodeURIComponent(back)}`
        : base;
}

/** Добавляет/заменяет `?error=` и не теряет остальной query. */
export function withAdminErrorParam(path: string, error: string): string {
    const [pathname, query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    params.delete('notice');
    params.set('error', error);

    return `${pathname}?${params.toString()}`;
}
