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
export type QuestionType = 'TEXT' | 'IMAGE_GUESS' | 'AUDIO_GUESS';

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
    /** Клип AUDIO_GUESS (`/media/audio/{hash}.mp3`); у других типов нет. */
    audioUrl?: string | null;
    /** Ключ ответа для `/api/quiz/:id/answer` (Classic / Blitz / Daily). */
    answerKey?: string;
    options: {
        id: string;
        text: string;
        order: number;
        isCorrect?: boolean;
    }[];
};

/** Зафиксированный ответ в токенах сессии — продолжение партии после F5. */
export type QuizLockedAnswer = {
    questionId: string;
    selectedOptionId: string;
    correctOptionId: string;
    isCorrect: boolean;
    /** Время фиксации на сервере (мс): паузы на музыку после F5. */
    answeredAtMs?: number;
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

/** Подпись трека AUDIO_GUESS в разборе (ADR AUDIO_GUESS → Rights). */
export type QuizAudioCredit = {
    track: string;
    composer: string;
    performer?: string;
};

/** Источник факта игроку не отдаём — он только для ревью и правок. */
export type QuizTriviaFact = {
    text: string;
};

// тип для одной строки в списке результатов обзора
export type QuizResultReviewItem = {
    questionId: string;
    position: number;
    text: string;
    type?: QuestionType;
    imageUrl?: string | null;
    audioUrl?: string | null;
    /** AUDIO_GUESS: «трек · композитор · исполнитель» для разбора (подпись источника). */
    audioCredit?: QuizAudioCredit | null;
    /** «А ты знал?»: факт об игре / серии на языке разбора. */
    fact?: QuizTriviaFact | null;
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
