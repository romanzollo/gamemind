/**
 * Обработчик туннеля Sentry: браузер шлёт события на `/api/m`
 * (rewrite из `tunnelRoute` в next.config.ts ведёт сюда).
 *
 * Почему handler, а не голый rewrite на ingest: запрос в Sentry делает наш
 * сервер и пересылает только тело события — без IP и cookie игрока; чужие
 * DSN отклоняются (принимается только DSN серверного SDK), туннель нельзя
 * использовать как открытый прокси. Путь `sentry-tunnel` фиксирован SDK.
 */

export { POST } from '@sentry/nextjs/tunnel';
