-- User Question Cycle MVP: shuffle-bag anti-repeat for Classic/Timed by difficulty.
-- One row per (userId, difficulty). remainingIds = JSON array of unused question ids.
-- Daily Challenge does not use this table. Writes happen on quiz start only (not submit).

CREATE TABLE "UserQuestionCycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "remainingIds" JSONB NOT NULL,
    "cycleNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserQuestionCycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserQuestionCycle_userId_difficulty_key"
ON "UserQuestionCycle"("userId", "difficulty");

CREATE INDEX "UserQuestionCycle_userId_idx"
ON "UserQuestionCycle"("userId");

ALTER TABLE "UserQuestionCycle"
ADD CONSTRAINT "UserQuestionCycle_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
