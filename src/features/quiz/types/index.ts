// тип для сложности вопросов
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

// тип вопроса (совпадает с Prisma enum QuestionType)
export type QuestionType = 'TEXT' | 'IMAGE_GUESS';

/** Жизненный цикл контента (Prisma QuestionPublicationStatus). Не путать с isActive. */
export type QuestionPublicationStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED';

// тип для входных данных для настройки викторины
export type QuizSetupInput = {
    difficulty: Difficulty;
    questionCount: number;
};

// тип публичного вопроса для отображения в UI без правильного ответа
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
    /** Слишком много start/submit для этого userId за окно. */
    | 'RATE_LIMITED';

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
