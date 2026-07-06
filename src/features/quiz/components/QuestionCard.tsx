'use client';

import type { QuizPublicQuestion } from '@/features/quiz/types';

type QuestionCardProps = {
    // порядковый номер в сессии (1-based), для отображения «1. …»
    index: number;
    question: QuizPublicQuestion;
    selectedOptionId?: string;
    onSelectOption: (optionId: string) => void;
    /**
     * Зарезервировано под IMAGE_GUESS (сделаю позже).
     * Пока не передаём — слот в разметке не рендерится.
     */
    imageUrl?: string | null;
    imageAlt?: string;
};

// компонент карточки вопроса
export function QuestionCard({
    index,
    question,
    selectedOptionId,
    onSelectOption,
    imageUrl,
    imageAlt,
}: QuestionCardProps) {
    return (
        <section
            className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
            aria-labelledby={`question-${question.id}-title`}
        >
            {imageUrl ? (
                <div className="mb-4 overflow-hidden rounded-md border border-border bg-surface-muted">
                    {/* QuestionImage + next/image — позже для media */}
                    <img
                        src={imageUrl}
                        alt={imageAlt ?? question.text}
                        className="aspect-video w-full object-cover object-center"
                    />
                </div>
            ) : null}

            <h2
                id={`question-${question.id}-title`}
                className="text-base font-semibold leading-snug text-foreground sm:text-lg"
            >
                <span className="text-muted">{index}.</span> {question.text}
            </h2>

            <div
                className="mt-4 space-y-2"
                role="radiogroup"
                aria-labelledby={`question-${question.id}-title`}
            >
                {question.options.map((option) => {
                    const isSelected = selectedOptionId === option.id;

                    return (
                        <label
                            key={option.id}
                            className={[
                                'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 transition',
                                'hover:bg-surface-hover',
                                'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
                                isSelected
                                    ? 'border-primary bg-surface-muted'
                                    : 'border-border bg-surface',
                            ].join(' ')}
                        >
                            <input
                                type="radio"
                                name={question.id}
                                value={option.id}
                                checked={isSelected}
                                onChange={() => onSelectOption(option.id)}
                                required
                                className="size-4 shrink-0 accent-primary"
                            />
                            <span className="text-sm leading-snug text-foreground sm:text-base">
                                {option.text}
                            </span>
                        </label>
                    );
                })}
            </div>
        </section>
    );
}
