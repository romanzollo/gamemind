/** Сложность одного вопроса / мешка цикла / single-сессии. Не MIXED. */
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

/**
 * Option формы старта Classic/Blitz.
 * MIXED — сигнал сессии (poolKind), не значение Question.difficulty.
 */
export type QuizSetupDifficulty = Difficulty | 'MIXED';

/** Как набран пул сессии. Исторические строки без поля = SINGLE. */
export type QuizSessionPoolKind = 'SINGLE' | 'MIXED';

// тип вопроса (совпадает с Prisma enum QuestionType)
export type QuestionType = 'TEXT' | 'IMAGE_GUESS';

/** Жизненный цикл контента (Prisma QuestionPublicationStatus). Не путать с isActive. */
export type QuestionPublicationStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED';

// тип для входных данных для настройки викторины
export type QuizSetupInput = {
    difficulty: QuizSetupDifficulty;
    questionCount: number;
};

// тип публичного вопроса для отображения в UI.
// `isCorrect` только Survival play DTO (принятый leak). Classic/Blitz/Daily — omit.
export type QuizPublicQuestion = {
    id: string;
    text: string;
    difficulty: Difficulty;
    type?: QuestionType;
    imageUrl?: string | null;
    options: {
        id: string;
        text: string;
        order: number;
        isCorrect?: boolean;
    }[];
};

// тип для статуса сессии викторины
export type QuizSessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';

// тип для кода ошибки викторины
export type QuizErrorCode =
    | 'INVALID_SETUP'
    | 'NOT_ENOUGH_QUESTIONS'
    | 'ANSWER_ALL'
    | 'INVALID_ANSWER'
    | 'SUBMIT_FAILED'
    /** Daily Challenge: слот одной попытки уже занят и не может быть resumed. */
    | 'DAILY_ATTEMPT_USED'
    /** Слишком много start/submit для этого userId за окно. */
    | 'RATE_LIMITED'
    /** Timed submit после timedEndsAt + grace (server clock). */
    | 'TIMED_OUT'
    /** Neon/direct pg wall-clock timeout на start (холодный старт / wedged socket). */
    | 'DB_TIMEOUT';

// тип для состояния формы викторины
export type QuizFormState = {
    errorCode?: QuizErrorCode;
};

// тип для одной строки в списке результатов обзора
export type QuizResultReviewItem = {
    questionId: string;
    position: number;
    text: string;
    type?: QuestionType;
    imageUrl?: string | null;
    isCorrect: boolean;
    selectedOption: {
        id: string;
        text: string;
    };
    correctOption: {
        id: string;
        text: string;
    };
};

export type QuizResultReviewFilter = 'all' | 'wrong' | 'correct';
