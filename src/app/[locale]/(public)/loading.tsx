import { Skeleton } from '@/shared/ui';

/**
 * Fallback главной (`/:locale`); у остальных маршрутов свои loading.tsx.
 *
 * Живёт в группе `(public)`, а не в `[locale]`: Suspense-граница на уровне
 * `[locale]` накрыла бы catch-all `[...rest]` — ответ начинал стримиться
 * до notFound(), и неизвестный URL получал 200 + noindex вместо 404.
 * Не поднимать обратно в `[locale]/`.
 *
 * Форма — как у героя главной (по центру экрана: логотип, заголовок,
 * описание, кнопки), иначе при подмене текст «съезжал» из угла в центр.
 * Высоты — замер окт 2026 (390 / 1280 px).
 */
export default function PublicLoading() {
    return (
        <main
            className="relative flex min-h-dvh flex-col overflow-hidden bg-background"
            aria-busy="true"
            aria-live="polite"
        >
            <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 sm:px-8">
                <Skeleton className="h-[60px] w-56 sm:h-[72px] sm:w-72 md:h-24 md:w-96" />
                <Skeleton className="mt-6 h-7 w-full max-w-xl sm:h-[33px]" />
                <Skeleton className="mt-4 h-[78px] w-full max-w-lg sm:h-[59px]" />
                <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                    <Skeleton className="h-11 w-full sm:h-11 sm:w-44" />
                    <Skeleton className="h-[20px] w-40 self-center sm:h-11 sm:w-36" />
                </div>
            </div>
        </main>
    );
}
