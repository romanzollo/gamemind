import { Skeleton } from '@/shared/ui';

/**
 * Скелетон результата — той же формы, что страница: max-w-2xl, карточка
 * итога и разбор ответов ниже. Режим на этапе загрузки неизвестен —
 * форма по Классике (основной режим); у Выживания сверху ещё плашка конца
 * волны. Высоты — замер окт 2026 (390 / 1280 px).
 */
export default function ResultLoading() {
    return (
        <main
            className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10"
            aria-busy="true"
            aria-live="polite"
        >
            <Skeleton className="h-[391px] rounded-lg sm:h-[372px]" />
            <div className="mt-8 border-t border-border pt-6 sm:mt-10 sm:pt-8">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="mt-4 h-40 rounded-lg" />
            </div>
        </main>
    );
}
