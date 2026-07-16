import type { Difficulty } from '@/features/quiz/types';

export type ProfileResultHistoryEntry = {
    sessionId: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    difficulty: Difficulty;
    completedAt: Date;
};
