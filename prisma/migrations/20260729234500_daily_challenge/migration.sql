-- Daily Challenge MVP: frozen question set per calendar day.
-- Classic QuizSession keeps dailyChallengeId NULL.
-- UNIQUE (userId, dailyChallengeId) = one attempt per user per day
-- (PostgreSQL allows multiple NULLs → classic sessions unaffected).
-- См. DECISIONS.md → Daily Challenge MVP.

CREATE TABLE "DailyChallenge" (
    "id" TEXT NOT NULL,
    "challengeDate" DATE NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "questionIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyChallenge_challengeDate_key"
ON "DailyChallenge"("challengeDate");

ALTER TABLE "QuizSession"
ADD COLUMN "dailyChallengeId" TEXT;

ALTER TABLE "QuizSession"
ADD CONSTRAINT "QuizSession_dailyChallengeId_fkey"
FOREIGN KEY ("dailyChallengeId") REFERENCES "DailyChallenge"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "QuizSession_dailyChallengeId_idx"
ON "QuizSession"("dailyChallengeId");

CREATE UNIQUE INDEX "QuizSession_userId_dailyChallengeId_key"
ON "QuizSession"("userId", "dailyChallengeId");
