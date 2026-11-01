-- Аккаунты без пароля: вход через Яндекс ID / VK ID и гостевая игра.
-- email NULL — VK ID мог не дать почту, у гостя её нет (UNIQUE допускает много NULL).
-- isGuest — гость скрыт из рейтингов, как isTestAccount.
-- Additive: DROP NOT NULL и константный DEFAULT — только метаданные, без переписывания таблицы.
-- Применять на prod ДО деплоя кода, который читает isGuest (иначе 42703).
-- Canon: docs/DECISIONS.md → Accounts without a password.

ALTER TABLE "User"
ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "email" DROP NOT NULL;
