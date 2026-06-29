// тип для записи в таблице лидеров
export type LeaderboardEntry = {
    rank: number;
    userId: string;
    username: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    completedAt: Date;
};
