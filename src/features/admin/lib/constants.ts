/** Сколько последних QuizResult показывать на admin user detail (support). */
export const ADMIN_USER_RESULT_HISTORY_LIMIT = 20;

/**
 * Размер страницы `/admin/questions`.
 *
 * Фиксируем в коде (не в URL): меньше битых query, стабильный Neon LIMIT.
 * 25 — плотный Scoreboard admin без тяжёлого RSC payload.
 */
export const ADMIN_QUESTION_LIST_PAGE_SIZE = 25;
