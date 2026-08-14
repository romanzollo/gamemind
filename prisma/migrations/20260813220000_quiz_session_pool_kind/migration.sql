-- Mixed-difficulty quiz: session pool signal, not Question.difficulty MIXED.
-- SINGLE keeps EASY|MEDIUM|HARD; MIXED stores difficulty NULL so leaderboard
-- "Medium" cannot swallow mix scores. Existing rows → poolKind SINGLE.
-- Start INSERT may omit poolKind (DEFAULT). Do not apply MIXED until pick exists.
-- Canon: DECISIONS.md → Mixed-difficulty quiz; ROADMAP §11.3.

CREATE TYPE "QuizSessionPoolKind" AS ENUM ('SINGLE', 'MIXED');

ALTER TABLE "QuizSession"
ADD COLUMN "poolKind" "QuizSessionPoolKind" NOT NULL DEFAULT 'SINGLE';

ALTER TABLE "QuizSession"
ALTER COLUMN "difficulty" DROP NOT NULL;

ALTER TABLE "QuizSession"
ADD CONSTRAINT "QuizSession_poolKind_difficulty_chk"
CHECK (
    ("poolKind" = 'SINGLE' AND "difficulty" IS NOT NULL)
    OR ("poolKind" = 'MIXED' AND "difficulty" IS NULL)
);

CREATE INDEX "QuizSession_poolKind_difficulty_idx"
ON "QuizSession"("poolKind", "difficulty");
