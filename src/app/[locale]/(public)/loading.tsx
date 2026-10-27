import { PageSkeleton } from '@/shared/ui';

/**
 * Fallback главной (`/:locale`); у остальных маршрутов свои loading.tsx.
 *
 * Живёт в группе `(public)`, а не в `[locale]`: Suspense-граница на уровне
 * `[locale]` накрыла бы catch-all `[...rest]` — ответ начинал стримиться
 * до notFound(), и неизвестный URL получал 200 + noindex вместо 404.
 * Не поднимать обратно в `[locale]/`.
 */
export default function PublicLoading() {
    return <PageSkeleton variant="default" />;
}
