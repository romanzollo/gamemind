import { Skeleton } from '@/shared/ui';

/**
 * Скелетон рейтинга той же формы, что страница: max-w-2xl, заголовок и
 * строка недели, переключатель периода, карточка «я», строки таблицы.
 * Переключатель стоит на своём месте — при подмене прыгает только низ.
 */
export default function LeaderboardLoading() {
    return (
        <main
            className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-10"
            aria-busy="true"
            aria-live="polite"
        >
            <Skeleton className="h-9 w-36 sm:h-10 sm:w-44" />
            <Skeleton className="mt-2 h-4 w-60 max-w-full" />
            <Skeleton className="mt-4 h-[54px]" />
            <Skeleton className="mt-4 h-[128px] rounded-lg" />
            <div className="mt-5 space-y-2">
                <Skeleton className="h-[52px] rounded-md" />
                <Skeleton className="h-[52px] rounded-md" />
                <Skeleton className="h-[52px] rounded-md" />
                <Skeleton className="h-[52px] rounded-md" />
            </div>
        </main>
    );
}
