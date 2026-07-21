'use client';

import type { QuizPublicQuestion } from '@/features/quiz/types';
import { QuestionImage } from '@/features/quiz/components/QuestionImage';

type QuestionCardProps = {
    index: number;
    question: QuizPublicQuestion;
    selectedOptionId?: string;
    onSelectOption: (optionId: string) => void;
    imageUrl?: string | null;
    imageAlt?: string;
    imageUnavailableLabel: string;
    /** Eager-load image for the first card (usually question 1). */
    imagePriority?: boolean;
};

type OptionIndicatorProps = {
    isSelected: boolean;
};

function OptionIndicator({ isSelected }: OptionIndicatorProps) {
    return (
        <span
            aria-hidden
            className={[
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 motion-safe:transition-colors',
                isSelected
                    ? 'border-primary bg-primary'
                    : 'border-muted bg-transparent',
            ].join(' ')}
        >
            {isSelected ? (
                <span className="size-2 rounded-full bg-primary-foreground" />
            ) : null}
        </span>
    );
}

export function QuestionCard({
    index,
    question,
    selectedOptionId,
    onSelectOption,
    imageUrl,
    imageAlt,
    imageUnavailableLabel,
    imagePriority = false,
}: QuestionCardProps) {
    return (
        <section
            className="rounded-lg bg-surface p-4 shadow-sm sm:p-5"
            aria-labelledby={`question-${question.id}-title`}
        >
            {imageUrl ? (
                <div className="mb-4">
                    <QuestionImage
                        src={imageUrl}
                        alt={imageAlt ?? question.text}
                        unavailableLabel={imageUnavailableLabel}
                        priority={imagePriority}
                    />
                </div>
            ) : null}

            <header className="mb-4 flex items-start gap-3">
                <span
                    className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-surface-muted px-2 text-xs font-semibold tabular-nums text-muted sm:text-sm"
                    aria-hidden
                >
                    {index}
                </span>
                <h2
                    id={`question-${question.id}-title`}
                    className="flex-1 text-base font-semibold leading-snug text-foreground sm:text-lg"
                >
                    {question.text}
                </h2>
            </header>

            <div
                className="space-y-2"
                role="radiogroup"
                aria-labelledby={`question-${question.id}-title`}
            >
                {question.options.map((option) => {
                    const isSelected = selectedOptionId === option.id;

                    return (
                        <label
                            key={option.id}
                            className={[
                                'flex min-h-11 cursor-pointer items-start gap-3 rounded-md border-2 p-3 motion-safe:transition-colors',
                                'hover:bg-surface-hover',
                                'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
                                isSelected
                                    ? 'border-primary bg-primary/10 shadow-sm'
                                    : 'border-transparent bg-surface-muted',
                            ].join(' ')}
                        >
                            <input
                                type="radio"
                                name={question.id}
                                value={option.id}
                                checked={isSelected}
                                onChange={() => onSelectOption(option.id)}
                                required
                                className="sr-only"
                            />
                            <OptionIndicator isSelected={isSelected} />
                            <span
                                className={[
                                    'text-sm leading-snug text-foreground sm:text-base',
                                    isSelected ? 'font-semibold' : 'font-normal',
                                ].join(' ')}
                            >
                                {option.text}
                            </span>
                        </label>
                    );
                })}
            </div>
        </section>
    );
}
