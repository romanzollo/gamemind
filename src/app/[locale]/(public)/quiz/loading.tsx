import { Skeleton } from '@/shared/ui';

/**
 * Скелетон лобби режимов — той же формы, что страница: max-w-2xl, шапка,
 * четыре карточки режимов в их порядке и высоте. Общий узкий скелетон при
 * переходе сменялся страницей в 4 раза выше — вёрстка «прыгала».
 * Высоты сняты замером вошедшего игрока (окт 2026, 390 / 1280 px):
 * меняется вёрстка лобби — поправить и здесь.
 */
export default function QuizSetupLoading() {
    return (
        <main
            className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10"
            aria-busy="true"
            aria-live="polite"
        >
            <header className="border-b border-border pb-4 sm:pb-5">
                <Skeleton className="h-8 w-32 sm:h-10 sm:w-40" />
                <Skeleton className="mt-2 h-5 w-full max-w-md sm:h-[1.625rem]" />
            </header>
            {/* Челлендж дня (с блоком серии: между «до игры» и «сыграно»), Блиц, Выживание, Классика. */}
            <Skeleton className="mt-5 h-[480px] rounded-lg sm:mt-6 sm:h-[450px]" />
            <Skeleton className="mt-4 h-[281px] rounded-lg sm:mt-5 sm:h-[334px]" />
            <Skeleton className="mt-4 h-[300px] rounded-lg sm:mt-5 sm:h-[293px]" />
            <Skeleton className="mt-4 h-[392px] rounded-lg sm:mt-5 sm:h-[429px]" />
        </main>
    );
}
