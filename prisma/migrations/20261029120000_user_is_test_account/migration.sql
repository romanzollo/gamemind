-- User.isTestAccount: служебные аккаунты (прод-smoke) скрыты из рейтингов.
-- Additive: константный DEFAULT в Postgres 11+ — только метаданные, без переписывания таблицы.
-- Применять на prod ДО деплоя кода, который фильтрует по колонке (иначе 42703 в рейтинге).
-- Canon: docs/DECISIONS.md → Prod smoke after deploy.

ALTER TABLE "User"
ADD COLUMN "isTestAccount" BOOLEAN NOT NULL DEFAULT false;
