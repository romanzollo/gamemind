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
    | 'PERFECT_QUIZ'
    | 'DAILY_COMPLETE'
    | 'MEDIUM_QUIZ'
    | 'HARD_QUIZ';

/**
 * Как проверяем критерий по уже сохранённым фактам (QuizResult / QuizSession).
 * Чистая логика + SQL-агрегаты; клиент не «заявляет» unlock.
 */
export type AchievementCriteriaKind =
    | 'quizzes_completed_at_least'
    | 'perfect_quiz_once'
    | 'daily_challenge_completed_once'
    | 'medium_quiz_completed_once'
    | 'hard_quiz_completed_once';

/**
 * Описание одного бейджа в каталоге (код + критерий).
 * Заголовок/описание — в словарях `dictionary.achievements.items[code]`, не здесь.
 */
export type AchievementDefinition = {
    code: AchievementCode;
    criteria: AchievementCriteriaKind;
    /**
     * Порог для count-критериев (например QUIZZES_5 → 5).
     * null если критерию достаточно «хотя бы один раз».
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
 */
export type AchievementEvalFacts = {
    quizzesCompleted: number;
    hasPerfectQuiz: boolean;
    hasDailyCompleted: boolean;
    hasMediumCompleted: boolean;
    hasHardCompleted: boolean;
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
 * v2: QUIZZES_10 (лестница после 5) + MEDIUM_QUIZ (ступень до HARD).
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
        code: 'PERFECT_QUIZ',
        criteria: 'perfect_quiz_once',
        threshold: null,
    },
    {
        code: 'DAILY_COMPLETE',
        criteria: 'daily_challenge_completed_once',
        threshold: null,
    },
    {
        code: 'MEDIUM_QUIZ',
        criteria: 'medium_quiz_completed_once',
        threshold: null,
    },
    {
        code: 'HARD_QUIZ',
        criteria: 'hard_quiz_completed_once',
        threshold: null,
    },
] as const;
