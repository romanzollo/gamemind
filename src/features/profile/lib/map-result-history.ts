import type { QuizSetupDifficulty } from '@/features/quiz/types';

import type {
    ProfileGameMode,
    ProfileResultHistoryEntry,
} from '../types/result-history-entry';

type RawResultHistoryRow = {
    sessionId: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    completedAt: Date;
    session: {
        difficulty: QuizSetupDifficulty;
        isDaily: boolean;
        isTimed: boolean;
        isFriendChallenge: boolean;
        survivalWaveIndex: number | null;
        topic: { nameRu: string; nameEn: string } | null;
    };
};

/** Режим по скалярам сессии; волна есть только у Выживания. */
export function getProfileGameMode(session: RawResultHistoryRow['session']): ProfileGameMode {
    if (session.isDaily) return 'daily';
    if (session.survivalWaveIndex != null) return 'survival';
    if (session.isTimed) return 'blitz';
    if (session.isFriendChallenge) return 'challenge';
    return 'classic';
}

export function mapResultHistory(
    rows: RawResultHistoryRow[],
): ProfileResultHistoryEntry[] {
    return rows.map((row) => ({
        sessionId: row.sessionId,
        score: row.score,
        totalQuestions: row.totalQuestions,
        correctCount: row.correctCount,
        difficulty: row.session.difficulty,
        mode: getProfileGameMode(row.session),
        waveIndex: row.session.survivalWaveIndex,
        topic: row.session.topic,
        completedAt: row.completedAt,
    }));
}
