import { Skeleton } from '@/shared/ui';

/**
 * Скелетон профиля — той же формы, что страница: max-w-2xl (lg: 5xl),
 * заголовок, плашка аккаунта и сводка ниже. Раньше здесь стоял узкий
 * скелетон формы входа (max-w-md) — при подмене контент «переезжал».
 * Высоты — замер окт 2026 (390 / 1280 px).
 */
export default function ProfileLoading() {
    return (
        <main
            className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10 lg:max-w-5xl"
            aria-busy="true"
            aria-live="polite"
        >
            <Skeleton className="h-8 w-36 sm:h-10 sm:w-44" />
            <Skeleton className="mt-6 h-[92px] sm:mt-8 sm:h-[100px]" />
            <div className="mt-8 sm:mt-10">
                <Skeleton className="h-6 w-28" />
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Skeleton className="h-20 rounded-lg" />
                    <Skeleton className="h-20 rounded-lg" />
                    <Skeleton className="h-20 rounded-lg" />
                    <Skeleton className="h-20 rounded-lg" />
                </div>
                <Skeleton className="mt-6 h-64 rounded-lg lg:mt-10" />
            </div>
        </main>
    );
}
