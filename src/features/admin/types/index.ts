import type { Difficulty } from '@/types';

export type LocalizedAdminText = {
    ru: { text: string };
    en: { text: string };
};

/** Строка списка вопросов в админке (без isCorrect и без лишних полей). */
export type AdminQuestionListItem = {
    id: string;
    text: string;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    optionsCount: number;
    createdAt: Date;
};

/** Вариант ответа для формы редактирования (нужен id для update, не delete+recreate). */
export type AdminQuestionOptionDetail = {
    id: string;
    translations: LocalizedAdminText;
    isCorrect: boolean;
    order: number;
};

/** Полный вопрос для страницы edit: все поля формы + options с id. */
export type AdminQuestionDetail = {
    id: string;
    translations: LocalizedAdminText;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    options: AdminQuestionOptionDetail[];
};

/** Стабильные коды ошибок для Server Actions (локализация в UI). */
export type AdminErrorCode =
    | 'INVALID_INPUT'
    | 'NOT_FOUND'
    | 'EXACTLY_ONE_CORRECT_REQUIRED'
    | 'SAVE_FAILED'
    | 'DELETE_FAILED'
    | 'DEACTIVATE_FAILED'
    | 'ACTIVATE_FAILED';

/** Состояние формы для useActionState (как в quiz). */
export type AdminFormState = {
    errorCode?: AdminErrorCode;
};
