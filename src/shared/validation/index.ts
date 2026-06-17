import { z } from "zod";

export const difficultySchema = z.enum(["EASY", "MEDIUM", "HARD"]);

export const quizSetupSchema = z.object({
  difficulty: difficultySchema,
  questionCount: z.number().int().min(5).max(30),
});
