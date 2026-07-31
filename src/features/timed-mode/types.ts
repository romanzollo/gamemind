/**
 * Контракт Timed mode (MVP) — доменная модель feature-слоя.
 *
 * Зачем отдельный файл до схемы и hot path:
 * - фиксируем правила продукта до миграции и правок start/submit;
 * - UI и actions позже импортируют константы отсюда, а не «магические числа»;
 * - scoring / snapshot write path пока не трогаем — только контракт.
 *
 * Canon: docs/DECISIONS.md → Timed Mode MVP.
 * Миграция: `20260731140000_quiz_session_timed_ends_at` (`QuizSession.timedEndsAt`).
 * Модель: классический фиксированный набор вопросов + серверный дедлайн
 * (не «бесконечный поток пока тикает таймер»).
 */

/**
 * Режим игры с точки зрения продукта.
 * CLASSIC / DAILY уже живут в своих feature-модулях;
 * здесь TIMED — новый режим. Позже можно централизовать в quiz/types.
 */
export type QuizPlayMode = 'CLASSIC' | 'DAILY' | 'TIMED';

/**
 * Правила Timed MVP — одна точка правды для тестов, ADR и будущих actions.
 *
 * Игрок выбирает сложность (как в classic setup), число вопросов и длительность
 * фиксированы. Таймер на клиенте — только UX; авторитет — `timedEndsAt` на сервере.
 */
export const TIMED_MODE_MVP_RULES = {
    /** Сколько вопросов замораживаем в snapshot при старте. */
    questionCount: 10,
    /**
     * Бюджет времени на всю сессию (секунды), одинаковый для всех сложностей в MVP.
     * Позже можно сделать таблицу по difficulty / questionCount.
     */
    durationSeconds: 120,
    /**
     * Допуск на сеть/склок после `timedEndsAt` при submit (секунды).
     * Клиентский «0» ≠ мгновенный отказ: иначе честный игрок ловит TIMED_OUT из‑за RTT.
     */
    graceSeconds: 3,
    /** Игрок выбирает сложность при старте (как classic). */
    difficultySource: 'player_choice' as const,
    /**
     * Попытки не ограничены календарным днём (это не Daily).
     * Один IN_PROGRESS timed-session на пользователя — продуктово ок отложить
     * до schema/start (abandon / resume), в контракте фиксируем «не once-per-day».
     */
    attemptsPolicy: 'unlimited' as const,
} as const;

/**
 * Публичный контракт сессии Timed для UI (после появления колонки / DTO).
 * Пока тип-документация: реализация start/page придёт следующими уроками.
 */
export type TimedSessionPublicState = {
    sessionId: string;
    /** ISO-строка момента, после которого submit без grace должен отклоняться. */
    timedEndsAt: string;
    /** Сколько секунд осталось roughly для гидрации таймера (сервер считает). */
    remainingSeconds: number;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    questionCount: number;
};

/**
 * Коды ошибок, специфичные для Timed (поверх общих QuizErrorCode).
 * Добавим в quiz types / словарь, когда появится submit-gate.
 */
export type TimedModeErrorCode =
    /** Submit пришёл после timedEndsAt + graceSeconds. */
    | 'TIMED_OUT'
    /** Сессия не timed, а action/UI ожидали timed (защитный код). */
    | 'NOT_TIMED_SESSION';
