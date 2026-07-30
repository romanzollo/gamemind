-- Achievements MVP (variant A): persist unlock facts only.
-- Catalog/criteria live in code (ACHIEVEMENT_CATALOG); titles in i18n.
-- UNIQUE (userId, code) = idempotent award (submit retry / profile catch-up).
-- См. DECISIONS.md → Achievements MVP.

CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAchievement_userId_code_key"
ON "UserAchievement"("userId", "code");

CREATE INDEX "UserAchievement_userId_idx"
ON "UserAchievement"("userId");

ALTER TABLE "UserAchievement"
ADD CONSTRAINT "UserAchievement_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
