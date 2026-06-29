import type { LeaderboardEntry } from '../types/leaderboard-entry';

// тип для строки в таблице лидеров
type RawLeaderboardRow = {
    userId: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    completedAt: Date;
    user: {
        id: string;
        username: string;
    };
};

// функция для преобразования строк в таблице лидеров в тип LeaderboardEntry
export function mapLeaderboardEntries(
    rows: RawLeaderboardRow[],
): LeaderboardEntry[] {
    // преобразование строк в тип LeaderboardEntry
    return rows.map((row, index) => ({
        rank: index + 1,
        userId: row.user.id,
        username: row.user.username,
        score: row.score,
        totalQuestions: row.totalQuestions,
        correctCount: row.correctCount,
        completedAt: row.completedAt,
    }));
}
