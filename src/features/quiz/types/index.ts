export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type QuizSetupInput = {
  difficulty: Difficulty;
  questionCount: number;
};

export type QuizSessionStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
