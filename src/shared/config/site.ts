/**
 * Публичный адрес сайта — для ссылок наружу (шаринг, Open Graph).
 *
 * Только www-хост: на него указывает DNS и прод-smoke (docs/DEPLOY.md).
 * Внутренние ссылки остаются относительными.
 */
export const SITE_ORIGIN = 'https://www.game-mind.ru';

/**
 * Почта для правообладателей: подвал → /rights. Запросы на снятие трека
 * или кадра — порядок в docs/DECISIONS.md → AUDIO_GUESS → Rights and takedown.
 */
export const RIGHTS_EMAIL = 'gamemind.rights@yandex.ru';
