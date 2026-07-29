/**
 * Контракт Daily Challenge (MVP) — доменная модель feature-слоя.
 *
 * Зачем отдельный файл рядом со схемой:
 * - продукт и правила живут в feature-слое без импорта Prisma Client в UI;
 * - DB-модель (`DailyChallenge` + `QuizSession.dailyChallengeId`) — хранение;
 * - scoring / snapshot hot path пока не меняем — только контракт + схема.
 *
 * Canon: docs/DECISIONS.md → Daily Challenge MVP.
 * Миграция: `20260729234500_daily_challenge`.
 */

/**
 * Режим сессии квиза с точки зрения продукта.
 * CLASSIC — текущий setup (игрок выбирает сложность и число вопросов).
 * DAILY — общий набор вопросов на календарный день, одна попытка.
 */
export type QuizPlayMode = 'CLASSIC' | 'DAILY';

/**
 * Календарный день челленджа в формате `YYYY-MM-DD`.
 * Считаем в Europe/Moscow (RU-first аудитория), не «чей UTC-понедельник».
 * Строка, а не Date — чтобы не путать с DateTime/таймзоной в JSON и URL.
 */
export type DailyChallengeDateKey = string;

/**
 * Замороженный набор вопросов на один день.
 * `questionIds` фиксируются при первом создании дня и больше не меняются —
 * иначе игроки получили бы разный пул после публикации новых вопросов.
 */
export type DailyChallengeDefinition = {
    /** Стабильный id строки DailyChallenge (cuid после появления таблицы). */
    id: string;
    /** Календарный день (Moscow), ключ уникальности. */
    challengeDate: DailyChallengeDateKey;
    /** MVP: одна сложность на день (как CLASSIC session.difficulty). */
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    /** Сколько вопросов в наборе (длина `questionIds`). */
    questionCount: number;
    /** Порядок = порядок в квизе; freeze на весь день. */
    questionIds: string[];
};

/**
 * Состояние «сегодняшнего» челленджа для текущего пользователя.
 * Нужно UI (CTA / disabled / ссылка на результат), без лишних SQL в компонентах.
 */
export type DailyChallengePlayerStatus =
    | {
          kind: 'available';
          challengeDate: DailyChallengeDateKey;
          /** Ещё не стартовал — можно начать. */
      }
    | {
          kind: 'in_progress';
          challengeDate: DailyChallengeDateKey;
          sessionId: string;
      }
    | {
          kind: 'completed';
          challengeDate: DailyChallengeDateKey;
          sessionId: string;
          score: number;
          totalQuestions: number;
          correctCount: number;
      }
    | {
          kind: 'unavailable';
          /** Например: пул опубликованных вопросов меньше questionCount. */
          reason: 'insufficient_pool' | 'not_authenticated';
      };

/** Правила MVP — одна точка правды для тестов и комментариев в actions. */
export const DAILY_CHALLENGE_MVP_RULES = {
    /** Таймзона «дня» для ключа challengeDate. */
    timezone: 'Europe/Moscow',
    /** MVP: фиксированная сложность (позже можно ротация / admin). */
    difficulty: 'MEDIUM' as const,
    /** MVP: фиксированное число вопросов. */
    questionCount: 10,
    /** Одна попытка на пользователя на challengeDate. */
    attemptsPerDay: 1,
} as const;
