/**
 * Публичные типы домена QuizSession (start / snapshot / submit / review).
 *
 * Зачем отдельный файл: §11.7 — монолитный quiz-session.repository делится
 * по сценариям; контракты для features остаются здесь, чтобы импорты не
 * зависели от того, в каком файле живёт SQL.
 * См. docs/DECISIONS.md → Repository File Split.
 */

import type { Difficulty, QuizSessionPoolKind, QuestionType } from '@/types';
import type { Locale } from '@/shared/i18n';
import type { LocalizedSnapshotTexts } from '@/entities/question/question.types';
import type { QuizSessionSnapshotData } from '@/entities/quiz-session/quiz-session-snapshot';

/** Базовый вход создания сессии (без snapshot). */
type CreateQuizSessionInput = {
    userId: string;
    /** SINGLE: EASY|MEDIUM|HARD. MIXED: null. */
    difficulty: Difficulty | null;
    /** Omit = SINGLE (Daily / Timed / legacy Classic). */
    poolKind?: QuizSessionPoolKind;
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
     * NULL/omit = classic/daily; non-null = Timed (флаг).
     * Дедлайн считается в INSERT после connect: Date.now()+timedDurationSeconds.
     * Не передавать Date.now()+60 до create hop. Не сочетать с dailyChallengeId.
     * Canon: DECISIONS.md → Timed clock.
     */
    timedEndsAt?: Date | null;
    /**
     * Бюджет Timed (секунды) для дедлайна на create hop после connect.
     * Игнорируется, если timedEndsAt null. Источник: TIMED_MODE_MVP_RULES.
     */
    timedDurationSeconds?: number;
    /**
     * NULL/omit = не Survival. Non-null = волна SurvivalRun.
     * Не сочетать с timedEndsAt или dailyChallengeId (CHECK).
     * Canon: DECISIONS.md → Survival Mode MVP.
     */
    survivalRunId?: string | null;
    /**
     * Номер волны. Обязателен вместе с survivalRunId (>= 1). Волна 1 MVP = 1.
     * Omit/NULL если не Survival — иначе CHECK на non-Survival.
     */
    survivalWaveIndex?: number | null;
};

/** Публичный вопрос из snapshot для UI квиза. */
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
        /**
         * Только Survival play DTO (принятый leak для lock-in без per-question API).
         * Classic / Blitz / Daily — поле отсутствует.
         * Canon: docs/DECISIONS.md → Survival Mode MVP (Play DTO leak).
         */
        isCorrect?: boolean;
    }>;
};

/**
 * Скаляры Survival на play-load. Банк / runId не живут только в snapshotData JSONB.
 * T0 / +4 / −6 клиент берёт из `SURVIVAL_MODE_MVP_RULES`, не из этой view.
 */
export type QuizSessionSurvivalPlayView = {
    runId: string;
    waveIndex: number;
    /** ISO `startedAt` с INSERT (JS Date после connect). */
    startedAt: string;
};

/**
 * Данные IN_PROGRESS сессии для quiz page.
 * `timedEndsAt` — ISO UTC; null = classic/daily/survival (Blitz countdown не показываем).
 * `survival` — null, если это не волна Survival.
 */
export type QuizSessionPublicView = {
    questions: SessionSnapshotPublicQuestion[];
    timedEndsAt: string | null;
    /** Сложность сессии; null = mix (poolKind MIXED). */
    difficulty: Difficulty | null;
    survival: QuizSessionSurvivalPlayView | null;
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
          /**
           * Survival-мета submit: нужна только для серверной сверки банка.
           * Для Classic/Blitz/Daily = null.
           */
          survival: {
              runId: string;
              startedAt: string;
          } | null;
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
