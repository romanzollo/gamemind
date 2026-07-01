import type { Difficulty } from '@/types';

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

/** Стабильные коды ошибок для Server Actions (локализация в UI). */
export type AdminErrorCode =
    | 'INVALID_INPUT'
    | 'NOT_FOUND'
    | 'EXACTLY_ONE_CORRECT_REQUIRED'
    | 'SAVE_FAILED'
    | 'DELETE_FAILED'
    | 'DEACTIVATE_FAILED';

/** Состояние формы для useActionState (как в quiz). */
export type AdminFormState = {
    errorCode?: AdminErrorCode;
};
