import type { QuizSetupDifficulty } from '@/features/quiz/types';

export type ProfileResultHistoryEntry = {
    sessionId: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    difficulty: QuizSetupDifficulty;
    completedAt: Date;
};
