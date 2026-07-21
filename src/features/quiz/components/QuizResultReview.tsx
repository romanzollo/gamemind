'use client';

import { useMemo, useState } from 'react';

import { QuestionImage } from '@/features/quiz/components/QuestionImage';
import type {
    QuizResultReviewFilter,
    QuizResultReviewItem,
} from '@/features/quiz/types';
import type { Dictionary } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui';

type QuizResultReviewProps = {
    items: QuizResultReviewItem[];
    labels: Dictionary['quiz'];
    /** фильтр по умолчанию */
    defaultFilter?: QuizResultReviewFilter;
};

// функция для фильтрации результатов обзора сессии
function matchesFilter(
    item: QuizResultReviewItem,
    filter: QuizResultReviewFilter,
) {
    if (filter === 'wrong') {
        return !item.isCorrect;
    }

    if (filter === 'correct') {
        return item.isCorrect;
    }

    return true;
}

// компонент для отображения результатов обзора сессии
export function QuizResultReview({
    items,
    labels,
    defaultFilter = 'wrong',
}: QuizResultReviewProps) {
    const [filter, setFilter] = useState<QuizResultReviewFilter>(defaultFilter);

    const visibleItems = useMemo(
        () => items.filter((item) => matchesFilter(item, filter)),
        [items, filter],
    );

    const filters: Array<{ id: QuizResultReviewFilter; label: string }> = [
        { id: 'all', label: labels.filterAll },
        { id: 'wrong', label: labels.filterWrong },
        { id: 'correct', label: labels.filterCorrect },
    ];

    if (items.length === 0) {
        return <EmptyState className="mt-6" title={labels.reviewEmpty} />;
    }

    return (
        <section className="mt-8 border-t border-border pt-6 sm:mt-10 sm:pt-8" aria-labelledby="quiz-result-review-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2
                    id="quiz-result-review-title"
                    className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                >
                    {labels.reviewTitle}
                </h2>

                <div
                    className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap"
                    role="group"
                    aria-label={labels.reviewTitle}
                >
                    {filters.map((entry) => {
                        const isActive = filter === entry.id;

                        return (
                            <button
                                key={entry.id}
                                type="button"
                                onClick={() => setFilter(entry.id)}
                                aria-pressed={isActive}
                                className={[
                                    'min-h-11 rounded-md px-2 py-2 text-center text-sm motion-safe:transition-colors sm:px-3 sm:py-1.5',
                                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                    isActive
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-surface-muted text-foreground hover:bg-surface-hover',
                                ].join(' ')}
                            >
                                {entry.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {visibleItems.length === 0 ? (
                <EmptyState className="mt-4" title={labels.reviewEmpty} />
            ) : (
                <ul className="mt-4 space-y-3">
                    {visibleItems.map((item, index) => {
                        const showCorrectAnswer =
                            !item.isCorrect ||
                            item.selectedOption.id !== item.correctOption.id;

                        return (
                            <li
                                key={item.questionId}
                                className={[
                                    'rounded-lg border p-3.5 shadow-sm sm:p-4',
                                    item.isCorrect
                                        ? 'border-success/30 bg-success-muted/40'
                                        : 'border-danger/30 bg-danger-muted/30',
                                ].join(' ')}
                            >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                    <p className="text-pretty text-sm font-medium leading-relaxed text-foreground sm:text-base">
                                        <span className="mr-2 tabular-nums text-muted">
                                            {item.position + 1}.
                                        </span>
                                        {item.text}
                                    </p>
                                    <span
                                        className={[
                                            'w-fit shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold',
                                            item.isCorrect
                                                ? 'bg-success/15 text-success'
                                                : 'bg-danger/15 text-danger',
                                        ].join(' ')}
                                    >
                                        {item.isCorrect
                                            ? labels.statusCorrect
                                            : labels.statusWrong}
                                    </span>
                                </div>

                                {item.imageUrl ? (
                                    <div className="mt-3 w-full">
                                        <QuestionImage
                                            src={item.imageUrl}
                                            alt={item.text}
                                            unavailableLabel={
                                                labels.imageUnavailable
                                            }
                                            priority={index === 0}
                                        />
                                    </div>
                                ) : null}

                                <dl className="mt-3 space-y-1.5 text-sm leading-relaxed">
                                    <div>
                                        <dt className="inline text-muted">
                                            {labels.yourAnswer}:{' '}
                                        </dt>
                                        <dd className="inline text-foreground">
                                            {item.selectedOption.text}
                                        </dd>
                                    </div>
                                    {showCorrectAnswer ? (
                                        <div>
                                            <dt className="inline text-muted">
                                                {labels.correctAnswer}:{' '}
                                            </dt>
                                            <dd className="inline font-medium text-foreground">
                                                {item.correctOption.text}
                                            </dd>
                                        </div>
                                    ) : null}
                                </dl>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
