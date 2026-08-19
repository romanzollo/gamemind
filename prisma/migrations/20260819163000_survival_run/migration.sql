-- Survival Mode MVP: SurvivalRun (scalars) + QuizSession discriminator.
-- Additive NULL columns: Classic/Blitz/Daily INSERT paths omit them → NULL.
-- CHECK: Survival cannot be Blitz (timedEndsAt) or Daily (dailyChallengeId).
-- Classic WHERE / achievement facts must use survivalRunId IS NULL
-- BEFORE any Survival QuizResult (HARD wave 36 must not land on Classic week).
-- Do not write snapshotData / bank JSON here. Runner is a later chat.
-- Canon: docs/DECISIONS.md → Survival Mode MVP.

CREATE TABLE "SurvivalRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "status" "QuizSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentWaveIndex" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "bankRemainingSeconds" INTEGER,

    CONSTRAINT "SurvivalRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SurvivalRun_userId_status_idx"
ON "SurvivalRun"("userId", "status");

ALTER TABLE "SurvivalRun"
ADD CONSTRAINT "SurvivalRun_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuizSession"
ADD COLUMN "survivalRunId" TEXT,
ADD COLUMN "survivalWaveIndex" INTEGER,
ADD COLUMN "survivalClockOk" BOOLEAN;

ALTER TABLE "QuizSession"
ADD CONSTRAINT "QuizSession_survivalRunId_fkey"
FOREIGN KEY ("survivalRunId") REFERENCES "SurvivalRun"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "QuizSession_survivalRunId_idx"
ON "QuizSession"("survivalRunId");

ALTER TABLE "QuizSession"
ADD CONSTRAINT "QuizSession_survival_mode_chk"
CHECK (
    (
        "survivalRunId" IS NULL
        AND "survivalWaveIndex" IS NULL
        AND "survivalClockOk" IS NULL
    )
    OR (
        "survivalRunId" IS NOT NULL
        AND "timedEndsAt" IS NULL
        AND "dailyChallengeId" IS NULL
        AND "survivalWaveIndex" IS NOT NULL
        AND "survivalWaveIndex" >= 1
        AND "poolKind" = 'SINGLE'
    )
);
