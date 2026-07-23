import type { Difficulty, QuestionType } from '@/types';

export type LocalizedAdminText = {
    ru: { text: string };
    en: { text: string };
};

/** Строка списка вопросов в админке (без isCorrect и без лишних полей). */
export type AdminQuestionListItem = {
    id: string;
    text: string;
    type: QuestionType;
    /** URL prompt-изображения; только для IMAGE_GUESS (иначе null). */
    promptImageUrl: string | null;
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
    type: QuestionType;
    promptImageUrl: string | null;
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
    | 'UPLOAD_FAILED'
    | 'INVALID_IMAGE'
    | 'DELETE_FAILED'
    | 'DEACTIVATE_FAILED'
    | 'ACTIVATE_FAILED'
    | 'CANNOT_MODIFY_SELF'
    | 'CANNOT_DELETE_LAST_ADMIN'
    | 'USER_UPDATE_FAILED'
    | 'USER_ROLE_UPDATE_FAILED'
    | 'USER_DEACTIVATE_FAILED'
    | 'USER_ACTIVATE_FAILED';

/** Состояние формы для useActionState (как в quiz). */
export type AdminFormState = {
    errorCode?: AdminErrorCode;
};

/** Строка списка пользователей в админке (без passwordHash). */
export type AdminUserListItem = {
    id: string;
    username: string;
    email: string;
    role: 'USER' | 'ADMIN';
    isActive: boolean;
    /** ISO string — безопасно для Client Components */
    createdAt: string;
    quizResultCount: number;
};
