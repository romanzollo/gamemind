import { Skeleton } from '@/shared/ui';

/**
 * Скелетон рейтинга — той же формы, что страница: max-w-3xl, заголовок,
 * три ряда фильтров (режим, период, сложность), подпись и строки доски.
 * Фильтры стоят на своих местах, поэтому при подмене прыгает только хвост
 * списка ниже них. Высоты — замер окт 2026 (390 / 1280 px).
 */
export default function LeaderboardLoading() {
    return (
        <main
            className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12"
            aria-busy="true"
            aria-live="polite"
        >
            <Skeleton className="h-9 w-36 sm:h-10 sm:w-44" />
            <Skeleton className="mt-2 h-5 w-72 max-w-full sm:h-6" />
            <Skeleton className="mt-4 h-[118px] sm:h-[78px]" />
            <Skeleton className="mt-3 h-[74px] sm:h-[78px]" />
            <div className="mt-3 border-b border-border pb-4">
                <Skeleton className="h-[119px] sm:h-[79px]" />
            </div>
            <Skeleton className="mt-3 h-[17px] w-64 max-w-full" />
            <div className="mt-4 space-y-2 sm:mt-5">
                <Skeleton className="h-[71px] rounded-lg sm:h-[106px]" />
                <Skeleton className="h-[71px] rounded-lg sm:h-[106px]" />
                <Skeleton className="h-[71px] rounded-lg sm:h-[106px]" />
            </div>
        </main>
    );
}
