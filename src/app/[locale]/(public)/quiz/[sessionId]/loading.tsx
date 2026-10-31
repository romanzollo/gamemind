import { Skeleton } from '@/shared/ui';

/**
 * Скелетон экрана игры — той же формы, что страница: max-w-2xl, заголовок
 * режима, липкая полоса прогресса и карточка вопроса. Вопрос появляется
 * на месте скелетона, без сдвига. Высоты — замер окт 2026 (390 / 1280 px).
 */
export default function QuizSessionLoading() {
    return (
        <main
            className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10"
            aria-busy="true"
            aria-live="polite"
        >
            <header className="border-b border-border pb-3 sm:pb-5">
                <Skeleton className="h-8 w-36 sm:h-10 sm:w-44" />
            </header>
            <div className="mt-4 sm:mt-6">
                <Skeleton className="h-[77px] rounded-lg sm:h-[85px]" />
                <Skeleton className="mt-4 h-[420px] rounded-lg sm:mt-6 sm:h-[480px]" />
            </div>
        </main>
    );
}
