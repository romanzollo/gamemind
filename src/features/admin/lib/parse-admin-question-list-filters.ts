import { z } from 'zod';

import type { Difficulty, QuestionType } from '@/types';

/**
 * Парсинг search params списка `/admin/questions`.
 *
 * Зачем отдельный модуль:
 * - URL — внешний вход (как FormData); валидируем до репозитория;
 * - невалидные значения не роняют страницу — fallback на «без фильтра»;
 * - один контракт для page → SQL WHERE (следующий шаг).
 *
 * Не смешивать с draft/published: status здесь только isActive.
 */

/** Статус в URL: active/inactive или all (без WHERE по isActive). */
export type AdminQuestionListStatusFilter = 'active' | 'inactive' | 'all';

/** Нормализованные фильтры списка вопросов (после parse). */
export type AdminQuestionListFilters = {
    status: AdminQuestionListStatusFilter;
    difficulty: Difficulty | 'all';
    type: QuestionType | 'all';
    /** Подстрока поиска по тексту; пустая строка = без поиска. */
    q: string;
};

const DEFAULT_FILTERS: AdminQuestionListFilters = {
    status: 'all',
    difficulty: 'all',
    type: 'all',
    q: '',
};

/** Верхняя граница длины q: защита от огромных URL, не «умность» поиска. */
const SEARCH_MAX_LENGTH = 200;

const adminQuestionListFiltersSchema = z.object({
    status: z.enum(['active', 'inactive', 'all']).default('all'),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'all']).default('all'),
    type: z.enum(['TEXT', 'IMAGE_GUESS', 'all']).default('all'),
    q: z
        .string()
        .trim()
        .max(SEARCH_MAX_LENGTH)
        .default(''),
});

function firstParam(
    value: string | string[] | undefined,
): string | undefined {
    if (Array.isArray(value)) {
        return value[0];
    }

    return value;
}

/** Пустая строка из GET-формы = «параметра нет» (Zod default), не ошибка. */
function emptyToUndefined(value: string | undefined): string | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined;
    }

    return value;
}

/**
 * Преобразует сырые searchParams страницы в безопасные фильтры.
 * Неизвестные ключи игнорируются; битые значения → defaults.
 */
export function parseAdminQuestionListFilters(
    searchParams: Record<string, string | string[] | undefined>,
): AdminQuestionListFilters {
    const raw = {
        status: emptyToUndefined(firstParam(searchParams.status)),
        difficulty: emptyToUndefined(firstParam(searchParams.difficulty)),
        type: emptyToUndefined(firstParam(searchParams.type)),
        q: emptyToUndefined(firstParam(searchParams.q)),
    };

    const parsed = adminQuestionListFiltersSchema.safeParse(raw);

    if (!parsed.success) {
        return DEFAULT_FILTERS;
    }

    return {
        status: parsed.data.status,
        difficulty: parsed.data.difficulty,
        type: parsed.data.type,
        q: parsed.data.q,
    };
}

/** Есть ли хотя бы одно ограничение (для empty-state / «сбросить»). */
export function hasActiveAdminQuestionListFilters(
    filters: AdminQuestionListFilters,
): boolean {
    return (
        filters.status !== 'all' ||
        filters.difficulty !== 'all' ||
        filters.type !== 'all' ||
        filters.q.length > 0
    );
}

/**
 * URL списка без «шумных» all/пустого q.
 * Нужен Client-навигации фильтров и Reset.
 */
export function buildAdminQuestionListHref(
    locale: string,
    filters: AdminQuestionListFilters,
): string {
    const params = new URLSearchParams();

    if (filters.status !== 'all') {
        params.set('status', filters.status);
    }

    if (filters.difficulty !== 'all') {
        params.set('difficulty', filters.difficulty);
    }

    if (filters.type !== 'all') {
        params.set('type', filters.type);
    }

    if (filters.q.length > 0) {
        params.set('q', filters.q);
    }

    const query = params.toString();
    const base = `/${locale}/admin/questions`;

    return query ? `${base}?${query}` : base;
}
