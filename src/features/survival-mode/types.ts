/**
 * Контракт Survival mode (MVP) — доменная модель feature-слоя.
 *
 * Зачем отдельный файл до схемы и hot path:
 * - фиксируем правила продукта до миграции и правок start/submit;
 * - UI и actions позже импортируют константы отсюда, а не «магические числа»;
 * - scoring / snapshot write path пока не трогаем — только контракт.
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP.
 * Не мержить с Timed: Blitz = `timedEndsAt` + фиксированные 60с;
 * Survival = `timedEndsAt` NULL + банк, реконструкция на submit.
 * Схема: `SurvivalRun` + `QuizSession.survivalRunId` (миграция
 * `20260819163000_survival_run`). `runSurvivalQuizStart` — следующий чат.
 */

/**
 * Режим игры с точки зрения продукта.
 * CLASSIC / DAILY / TIMED уже живут в своих feature-модулях;
 * SURVIVAL — новый. Позже можно централизовать в quiz/types.
 */
export type QuizPlayMode = 'CLASSIC' | 'DAILY' | 'TIMED' | 'SURVIVAL';

/**
 * Сложность Survival MVP. Mix (`MIXED` / `poolKind`) в этом режиме нет.
 */
export type SurvivalDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

/**
 * Правила Survival MVP — одна точка правды для тестов, ADR и будущих actions.
 *
 * Волна = frozen snapshot из 12 вопросов (тот же `createWithJsonSnapshot`).
 * Клиентский remaining — только UX. Авторитет часов: `startedAt` / `completedAt`
 * + число верных и неверных из snapshot. Не UPDATE `timedEndsAt` на ответ.
 */
export const SURVIVAL_MODE_MVP_RULES = {
    /** Сколько вопросов замораживаем в snapshot волны 1. Не 40+ (TOAST). */
    questionCount: 12,
    /**
     * Стартовый банк волны 1 (секунды). Волна 2+ (later) берёт carry
     * со скаляра `SurvivalRun.bankRemainingSeconds`, не из JSONB.
     */
    initialBankSeconds: 20,
    /** Начисление к банку за верный ответ. Не меняет `scoring.ts`. */
    correctDeltaSeconds: 4,
    /**
     * Штраф банка за неверный. Unanswered на auto-submit не штрафуем
     * (как Blitz: нет ответа = 0 очков, без −6с).
     */
    wrongDeltaSeconds: 6,
    /**
     * Допуск на сеть/склок при сверке elapsed vs budget (секунды).
     * Сравнивать: `elapsed <= budget + grace`,
     * где `elapsed = completedAt - startedAt`.
     * Не прибавлять grace к elapsed (это сужает допуск и карает Neon-лаг).
     */
    graceSeconds: 3,
    /** Игрок выбирает EASY|MEDIUM|HARD. Mix в MVP нет. */
    difficultySource: 'player_choice_single' as const,
    /**
     * Попытки не ограничены календарным днём (это не Daily).
     * Новый забег всегда создаёт новый `SurvivalRun`.
     */
    attemptsPolicy: 'unlimited' as const,
    /**
     * Застрявшие Survival-сессии: при новом забеге (новый SurvivalRun)
     * IN_PROGRESS с `survivalRunId IS NOT NULL` у этого user → ABANDONED
     * (и run → ABANDONED), без QuizResult.
     *
     * Почему abandon, а не resume — как Timed: давление по часам;
     * «продолжить через час» ломает банк. Daily resume — другой продукт
     * (UNIQUE на день). Classic/Blitz/Daily этим политикам не подпадают.
     *
     * Scope: только Survival. Resume в MVP нет.
     * Hop: pooled scalar **до** pick, не UPDATE+JSONB на Direct create.
     */
    stuckSessionPolicy: 'abandon_on_new_start' as const,
    /**
     * Доска: отдельный mode. Не писать эти очки в Classic/Blitz/Daily best.
     * MVP-копирайт: рекорд волны, не endless streak.
     */
    leaderboardPolicy: 'exclusive_survival_wave_record' as const,
    /**
     * Cycle: тот же мешок `userId + difficulty`, что Classic/Timed.
     * Daily не использует cycle — этот режим его не трогает.
     */
    cycleBag: 'shared_user_difficulty' as const,
} as const;

/**
 * Публичный контракт волны для UI (после появления колонок / DTO).
 * `remainingSeconds` считает клиент; сервер на submit это поле не читает.
 */
export type SurvivalSessionPublicState = {
    sessionId: string;
    runId: string;
    waveIndex: number;
    /** ISO `startedAt` с INSERT (JS Date после connect), для гидрации банка. */
    startedAt: string;
    initialBankSeconds: number;
    correctDeltaSeconds: number;
    wrongDeltaSeconds: number;
    difficulty: SurvivalDifficulty;
    questionCount: number;
};

/**
 * Коды ошибок, специфичные для Survival (поверх общих QuizErrorCode).
 * Невалидные часы в MVP не void’ят result — строка пишется, на доску не берём.
 */
export type SurvivalModeErrorCode =
    /** Сессия не Survival, а action/UI ожидали Survival. */
    | 'NOT_SURVIVAL_SESSION'
    /**
     * Submit за пределами budget+grace: complete всё равно,
     * `survivalClockOk = false` → exclusive board не берёт строку.
     */
    | 'SURVIVAL_CLOCK_INVALID';

/**
 * Вход чистой сверки банка (Vitest в чате B, не hot path).
 *
 * `budget = max(0, T0 + plus×correct − minus×wrong)`
 * `clockOk ⇔ elapsedMs <= budgetMs + graceMs`
 */
export type SurvivalClockCheckInput = {
    startedAtMs: number;
    completedAtMs: number;
    correctCount: number;
    wrongCount: number;
    initialBankSeconds?: number;
    correctDeltaSeconds?: number;
    wrongDeltaSeconds?: number;
    graceSeconds?: number;
};
