import { notFound } from 'next/navigation';

/**
 * Catch-all для неизвестных адресов под `/:locale/...`.
 *
 * Зачем: root layout — динамический `[locale]`, поэтому без этого маршрута
 * unmatched URL получает голый дефолтный 404 Next без шапки и темы.
 * notFound() отдаёт статус 404 и рендерит `[locale]/not-found.tsx`.
 * Конкретные маршруты (static и `[sessionId]`) всегда приоритетнее catch-all.
 *
 * Статус 404 держится, только пока над этим маршрутом нет loading.tsx /
 * Suspense: иначе ответ стримится раньше notFound() → 200 + noindex.
 * Поэтому `[locale]/` без loading.tsx (см. `(public)/loading.tsx`).
 */
export default function UnknownLocaleRoute(): never {
    notFound();
}
