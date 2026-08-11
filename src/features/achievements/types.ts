/**
 * Контракт Achievements — доменная модель feature-слоя.
 *
 * Зачем отдельный файл рядом со схемой:
 * - каталог бейджей и правила живут в feature-слое без Prisma в UI;
 * - DB хранит только факт разблокировки (`UserAchievement`), не тексты;
 * - scoring / snapshot hot path не меняем — unlock = побочный эффект после результата.
 *
 * Масштаб доменов (video-games → movies / football / music):
 * - коды domain-agnostic (`FIRST_QUIZ`, не `FIRST_VIDEO_GAME_QUIZ`);
 * - критерии смотрят на QuizResult/QuizSession;
 * - узкие бейджи по категории — позже, когда taxonomy реально появится.
 *
 * Canon: docs/DECISIONS.md → Achievements MVP.
 * Миграция: `20260730120000_user_achievement` (новые коды = те же строки, без schema change).
 */

/**
 * Стабильный код бейджа (slug).
 * Пишется в UserAchievement.code; i18n и критерии смотрят на тот же код.
 * Не переименовывать после продакшена без миграции данных.
 */
export type AchievementCode =
    | 'FIRST_QUIZ'
    | 'QUIZZES_5'
    | 'QUIZZES_10'
    | 'QUIZZES_25'
    | 'QUIZZES_50'
    | 'PERFECT_QUIZ'
    | 'PERFECT_3'
    | 'DAILY_COMPLETE'
    | 'DAILY_3'
    | 'MEDIUM_QUIZ'
    | 'MEDIUM_5'
    | 'HARD_QUIZ'
    | 'HARD_3'
    | 'TIMED_COMPLETE'
    | 'CLASSIC_AND_TIMED'
    | 'HIGH_ACCURACY_90'
    | 'POINTS_250';

/**
 * Как проверяем критерий по уже сохранённым фактам (QuizResult / QuizSession).
 * Чистая логика + SQL-агрегаты; клиент не «заявляет» unlock.
 */
export type AchievementCriteriaKind =
    | 'quizzes_completed_at_least'
    | 'perfect_quiz_once'
    | 'perfect_quiz_at_least'
    | 'daily_challenge_completed_once'
    | 'daily_challenge_completed_at_least'
    | 'medium_quiz_completed_once'
    | 'medium_quiz_completed_at_least'
    | 'hard_quiz_completed_once'
    | 'hard_quiz_completed_at_least'
    | 'timed_quiz_completed_once'
    | 'classic_and_timed_completed'
    | 'high_accuracy_quiz_once'
    | 'total_score_at_least';

/**
 * Описание одного бейджа в каталоге (код + критерий).
 * Заголовок/описание — в словарях `dictionary.achievements.items[code]`, не здесь.
 */
export type AchievementDefinition = {
    code: AchievementCode;
    criteria: AchievementCriteriaKind;
    /**
     * Порог для count-критериев (например QUIZZES_5 → 5).
     * null если критерию достаточно «хотя бы один раз» (или составной once).
     */
    threshold: number | null;
};

/**
 * Состояние бейджа для UI профиля (один пользователь).
 * `unlockedAt` null = ещё не получен; дата = когда сервер зафиксировал unlock.
 *
 * `criteriaCurrent` / `criteriaTarget` — прогресс к критерию (сервер из EvalFacts).
 * Оба null = метрику показать нельзя (битый threshold и т.п.).
 * Не путать с шапочным `progressCount` (сколько бейджей открыто / всего в каталоге).
 */
export type AchievementProgressItem = {
    code: AchievementCode;
    unlockedAt: Date | null;
    criteriaCurrent: number | null;
    criteriaTarget: number | null;
};

/**
 * Сводка для секции профиля: весь каталог + unlock + прогресс к критерию.
 * Порядок = порядок в ACHIEVEMENT_CATALOG (стабильный для UI).
 */
export type AchievementProgress = {
    items: AchievementProgressItem[];
};

/**
 * Факты о прогрессе игрока, достаточные для оценки критериев.
 * Собираем одним SQL на сервере; не тащим весь QuizResult в память.
 *
 * Режимы сессии (нет колонки mode):
 * - Classic: dailyChallengeId IS NULL AND timedEndsAt IS NULL
 * - Daily: dailyChallengeId IS NOT NULL
 * - Timed (Blitz UI): timedEndsAt IS NOT NULL
 */
export type AchievementEvalFacts = {
    quizzesCompleted: number;
    hasPerfectQuiz: boolean;
    perfectQuizCount: number;
    hasDailyCompleted: boolean;
    dailyCompletedCount: number;
    hasMediumCompleted: boolean;
    mediumCompletedCount: number;
    hasHardCompleted: boolean;
    hardCompletedCount: number;
    hasTimedCompleted: boolean;
    hasClassicCompleted: boolean;
    hasHighAccuracy90: boolean;
    totalScore: number;
};

/** Правила — одна точка правды для тестов и комментариев. */
export const ACHIEVEMENTS_MVP_RULES = {
    /** Каталог только в коде; admin CRUD позже. */
    catalogSource: 'code' as const,
    /** Unlock только сервером после QuizResult (и catch-up на profile). */
    awardSource: 'server' as const,
    /** Первая UI-поверхность: профиль. */
    primarySurface: 'profile' as const,
    /**
     * Бейджи глобальные по аккаунту (любой контент-домен).
     * Позже: category-scoped коды или колонка scope — когда появятся movies/football/…
     */
    scope: 'global' as const,
} as const;

/**
 * Стабильный каталог. Новый бейдж = новый код + критерий + i18n + (при необходимости) SQL facts.
 * Порядок массива = порядок отображения.
 *
 * v3: лестница 25/50, Timed/Classic+Timed, Daily×3, quality, points, глубина сложности.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = [
    {
        code: 'FIRST_QUIZ',
        criteria: 'quizzes_completed_at_least',
        threshold: 1,
    },
    {
        code: 'QUIZZES_5',
        criteria: 'quizzes_completed_at_least',
        threshold: 5,
    },
    {
        code: 'QUIZZES_10',
        criteria: 'quizzes_completed_at_least',
        threshold: 10,
    },
    {
        code: 'QUIZZES_25',
        criteria: 'quizzes_completed_at_least',
        threshold: 25,
    },
    {
        code: 'QUIZZES_50',
        criteria: 'quizzes_completed_at_least',
        threshold: 50,
    },
    {
        code: 'PERFECT_QUIZ',
        criteria: 'perfect_quiz_once',
        threshold: null,
    },
    {
        code: 'PERFECT_3',
        criteria: 'perfect_quiz_at_least',
        threshold: 3,
    },
    {
        code: 'DAILY_COMPLETE',
        criteria: 'daily_challenge_completed_once',
        threshold: null,
    },
    {
        code: 'DAILY_3',
        criteria: 'daily_challenge_completed_at_least',
        threshold: 3,
    },
    {
        code: 'TIMED_COMPLETE',
        criteria: 'timed_quiz_completed_once',
        threshold: null,
    },
    {
        code: 'CLASSIC_AND_TIMED',
        criteria: 'classic_and_timed_completed',
        threshold: null,
    },
    {
        code: 'HIGH_ACCURACY_90',
        criteria: 'high_accuracy_quiz_once',
        threshold: null,
    },
    {
        code: 'POINTS_250',
        criteria: 'total_score_at_least',
        threshold: 250,
    },
    {
        code: 'MEDIUM_QUIZ',
        criteria: 'medium_quiz_completed_once',
        threshold: null,
    },
    {
        code: 'MEDIUM_5',
        criteria: 'medium_quiz_completed_at_least',
        threshold: 5,
    },
    {
        code: 'HARD_QUIZ',
        criteria: 'hard_quiz_completed_once',
        threshold: null,
    },
    {
        code: 'HARD_3',
        criteria: 'hard_quiz_completed_at_least',
        threshold: 3,
    },
] as const;
