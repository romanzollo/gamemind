// тип для сложности вопросов
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

// тип вопроса (совпадает с Prisma enum QuestionType)
export type QuestionType = 'TEXT' | 'IMAGE_GUESS';

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
    | 'SUBMIT_FAILED';

// тип для состояния формы викторины
export type QuizFormState = {
    errorCode?: QuizErrorCode;
};
