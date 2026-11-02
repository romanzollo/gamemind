import { Skeleton } from '@/shared/ui';

/**
 * Fallback главной (`/:locale`) и бывшего лобби `/quiz` (оно перенаправляет
 * на главную); у остальных маршрутов свои loading.tsx.
 *
 * Живёт в группе `(public)`, а не в `[locale]`: Suspense-граница на уровне
 * `[locale]` накрыла бы catch-all `[...rest]` — ответ начинал стримиться
 * до notFound(), и неизвестный URL получал 200 + noindex вместо 404.
 * Не поднимать обратно в `[locale]/`.
 *
 * Форма — как у главной вошедшего игрока: карточка Челленджа дня (с серией
 * и рейтингом дня), «Продолжить», заголовок и три карточки режимов, —
 * иначе при подмене вёрстка «прыгала». Меняется главная — поправить здесь.
 */
export default function PublicLoading() {
    return (
        <main
            className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10"
            aria-busy="true"
            aria-live="polite"
        >
            <Skeleton className="h-[480px] rounded-lg sm:h-[450px]" />
            <Skeleton className="mt-4 h-[92px] rounded-lg" />
            <Skeleton className="mt-6 h-7 w-28 sm:mt-8" />
            <div className="mt-3 flex flex-col gap-3">
                <Skeleton className="h-[74px] rounded-lg sm:h-[82px]" />
                <Skeleton className="h-[74px] rounded-lg sm:h-[82px]" />
                <Skeleton className="h-[90px] rounded-lg sm:h-[82px]" />
            </div>
        </main>
    );
}
