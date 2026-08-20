-- Survival wave 2+: run totalScore + exclusion seen ids (no JSONB on run/complete).
-- Additive: existing SurvivalRun rows get totalScore=0; seen table empty until after-complete.
-- Canon: docs/DECISIONS.md → Survival Mode MVP; types.ts leaderboardPolicy / waveCarryPoolEndPolicy.
-- Do not write bank/duration JSON here. Do not touch Classic/Blitz/Daily CHECK.

ALTER TABLE "SurvivalRun"
ADD COLUMN "totalScore" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "SurvivalRun_totalScore_idx"
ON "SurvivalRun"("totalScore");

CREATE TABLE "SurvivalRunSeenQuestion" (
    "runId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,

    CONSTRAINT "SurvivalRunSeenQuestion_pkey"
        PRIMARY KEY ("runId", "questionId")
);

CREATE INDEX "SurvivalRunSeenQuestion_questionId_idx"
ON "SurvivalRunSeenQuestion"("questionId");

ALTER TABLE "SurvivalRunSeenQuestion"
ADD CONSTRAINT "SurvivalRunSeenQuestion_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "SurvivalRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurvivalRunSeenQuestion"
ADD CONSTRAINT "SurvivalRunSeenQuestion_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "Question"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
