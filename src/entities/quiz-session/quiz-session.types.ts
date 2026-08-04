/**
 * Публичные типы домена QuizSession (start / snapshot / submit / review).
 *
 * Зачем отдельный файл: §11.7 — монолитный quiz-session.repository делится
 * по сценариям; контракты для features остаются здесь, чтобы импорты не
 * зависели от того, в каком файле живёт SQL.
 * См. docs/DECISIONS.md → Repository File Split.
 */

import type { Difficulty, QuestionType } from '@/types';
import type { Locale } from '@/shared/i18n';
import type { LocalizedSnapshotTexts } from '@/entities/question/question.types';
import type { QuizSessionSnapshotData } from '@/entities/quiz-session/quiz-session-snapshot';

/** Базовый вход создания сессии (без snapshot). */
type CreateQuizSessionInput = {
    userId: string;
    difficulty: Difficulty;
    questionCount: number;
};

/** Один вопрос в snapshot сессии (порядок вариантов уже зафиксирован). */
export type SessionSnapshotQuestionInput = {
    questionId: string;
    position: number;
    displayText: string;
    displayTexts: LocalizedSnapshotTexts;
    displayImageUrl?: string | null;
    options: Array<{
        optionId: string;
        displayOrder: number;
        displayText: string;
        displayTexts: LocalizedSnapshotTexts;
    }>;
};

/** Создание сессии вместе с snapshot вопросов и порядка вариантов. */
export type CreateQuizSessionWithSnapshotInput = CreateQuizSessionInput & {
    sessionLocale: Locale;
    questions: SessionSnapshotQuestionInput[];
    /** NULL/omit = classic; set = Daily Challenge attempt (UNIQUE per user). */
    dailyChallengeId?: string | null;
    /**
     * NULL/omit = classic/daily; set = Timed mode deadline (server clock).
     * Не сочетать с dailyChallengeId. Canon: DECISIONS.md → Timed Mode MVP.
     */
    timedEndsAt?: Date | null;
};

/** Публичный вопрос из snapshot для UI квиза (без isCorrect). */
export type SessionSnapshotPublicQuestion = {
    id: string;
    text: string;
    difficulty: Difficulty;
    type?: QuestionType;
    imageUrl?: string | null;
    options: Array<{
        id: string;
        text: string;
        order: number;
    }>;
};

/**
 * Данные IN_PROGRESS сессии для quiz page.
 * `timedEndsAt` — ISO UTC; null = classic/daily (countdown не показываем).
 */
export type QuizSessionPublicView = {
    questions: SessionSnapshotPublicQuestion[];
    timedEndsAt: string | null;
    /** Сложность сессии — rematch Timed с теми же правилами. */
    difficulty: Difficulty;
};

/** Вопрос из snapshot для server-side scoring (с isCorrect, без текста). */
export type SessionSnapshotScoringQuestion = {
    id: string;
    difficulty: Difficulty;
    options: Array<{
        id: string;
        isCorrect: boolean;
    }>;
};

/** Результат одного read для submit: сессия + snapshot для scoring. */
export type SessionForSubmitResult =
    | { status: 'not_found' }
    | { status: 'invalid_snapshot' }
    | {
          status: 'ready';
          sessionId: string;
          questions: SessionSnapshotScoringQuestion[];
          /**
           * ISO UTC или null. null = classic/daily (без Timed gate).
           * Submit сравнивает с server now + grace — не с клиентским таймером.
           */
          timedEndsAt: string | null;
          snapshotData: QuizSessionSnapshotData | null;
      };

/**
 * Ошибка quiz start: в пуле не хватает активных PUBLISHED вопросов.
 * Server Action мапит код в QuizFormState.errorCode.
 */
export class QuizSessionStartError extends Error {
    readonly code: 'NOT_ENOUGH_QUESTIONS';

    constructor(code: 'NOT_ENOUGH_QUESTIONS') {
        super(code);
        this.code = code;
    }
}

/** Payload обзора завершённой сессии (result page, owner-only). */
export type SessionReviewPayload = {
    sessionId: string;
    questionCount: number;
    questions: Array<{
        id: string;
        text: string;
        difficulty: Difficulty;
        type?: QuestionType;
        imageUrl?: string | null;
        position: number;
        options: Array<{
            id: string;
            text: string;
            order: number;
            isCorrect: boolean;
        }>;
    }>;
    answers: Array<{
        questionId: string;
        selectedOptionId: string;
        isCorrect: boolean;
    }>;
};
