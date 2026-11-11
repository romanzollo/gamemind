import type { QuizSetupDifficulty } from '@/features/quiz/types';

/**
 * Режим игры в истории профиля. Выводится из скаляров сессии
 * (как доски рейтинга): Челлендж дня → Выживание → Блиц → Вызов → Классика.
 */
export type ProfileGameMode = 'classic' | 'blitz' | 'survival' | 'daily' | 'challenge';

export type ProfileResultHistoryEntry = {
    sessionId: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    difficulty: QuizSetupDifficulty;
    mode: ProfileGameMode;
    /** Номер волны; только у Выживания. */
    waveIndex: number | null;
    /** Тема Классики / Блица; null — весь банк. */
    topic: { nameRu: string; nameEn: string } | null;
    completedAt: Date;
};
