/**
 * Кто виден в рейтингах (Classic / Blitz / Survival / Daily).
 *
 * - `isActive = false` — аккаунт отключён админом: результаты остаются в БД,
 *   но место в таблице он не занимает (вернётся после активации).
 * - `isTestAccount = true` — служебный игрок прод-smoke: играет каждый деплой
 *   и иначе вытеснял бы живых людей из топа.
 *
 * Фрагмент для `INNER JOIN "User" AS u ON … AND <фрагмент>`: рассчитан на
 * алиас `u`. Фильтр стоит после DISTINCT ON по userId — лучший результат
 * считается на пользователя, поэтому скрытие одного не сдвигает чужие.
 * Будущая статистика вопросов (сложность по ответам) тоже должна исключать
 * `isTestAccount`: smoke отвечает не как человек.
 *
 * См. DECISIONS.md → Prod smoke after deploy.
 */
export const LEADERBOARD_VISIBLE_USER_SQL =
    'u."isActive" = true AND u."isTestAccount" = false';
