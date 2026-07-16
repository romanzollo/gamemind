import type { Difficulty } from '@/features/quiz/types';

import type { ProfileResultHistoryEntry } from '../types/result-history-entry';

type RawResultHistoryRow = {
    sessionId: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    completedAt: Date;
    session: {
        difficulty: Difficulty;
    };
};

export function mapResultHistory(
    rows: RawResultHistoryRow[],
): ProfileResultHistoryEntry[] {
    return rows.map((row) => ({
        sessionId: row.sessionId,
        score: row.score,
        totalQuestions: row.totalQuestions,
        correctCount: row.correctCount,
        difficulty: row.session.difficulty,
        completedAt: row.completedAt,
    }));
}
