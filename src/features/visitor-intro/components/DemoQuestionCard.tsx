'use client';

/**
 * Живой демо-вопрос на первом экране посетителя (4.3c): нажал вариант —
 * сразу «В точку! / Мимо», дальше «Ещё вопрос» по кругу.
 *
 * Проверка — в браузере: демо-вопросов нет в игровом банке, ответы и так
 * лежат в HTML (`demo-questions.ts`). На сервер ничего не уходит, очки не
 * считаются. Вид вариантов и плашки — общий с игрой (`answer-option.ts`).
 */

import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { DemoQuestionView } from '@/features/visitor-intro/lib/demo-questions';
import type { Dictionary } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';
import {
    answerOptionClassName,
    answerVerdictClassName,
    type AnswerOptionTone,
} from '@/shared/ui/answer-option';

type DemoQuestionCardProps = {
    questions: DemoQuestionView[];
    /** Вопрос дня — его же отрисовал сервер. */
    startIndex: number;
    dictionary: Dictionary;
};

export function DemoQuestionCard({
    questions,
    startIndex,
    dictionary,
}: DemoQuestionCardProps) {
    const [index, setIndex] = useState(startIndex);
    const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
        null,
    );
    const headingRef = useRef<HTMLHeadingElement>(null);
    const headingId = useId();
    const labels = dictionary.quiz.answer;
    const question = questions[index % questions.length];
    const answered = selectedOptionId !== null;
    const isCorrect = selectedOptionId === question.correctOptionId;
    const correctText = question.options.find(
        (option) => option.id === question.correctOptionId,
    )?.text;
    const verdict = answerVerdictClassName(isCorrect);

    function showNext() {
        // Кнопка «Ещё вопрос» исчезает — фокус переводим на новый вопрос,
        // чтобы клавиатура и скринридер не потерялись.
        flushSync(() => {
            setIndex((current) => (current + 1) % questions.length);
            setSelectedOptionId(null);
        });
        headingRef.current?.focus();
    }

    function toneFor(optionId: string): AnswerOptionTone {
        if (!answered) {
            return 'idle';
        }

        if (optionId === question.correctOptionId) {
            return 'correct';
        }

        return optionId === selectedOptionId ? 'wrong' : 'dimmed';
    }

    return (
        <section
            aria-labelledby={headingId}
            data-testid="demo-question"
            className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6"
        >
            <p className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
                {dictionary.home.demoEyebrow}
            </p>
            <h2
                id={headingId}
                ref={headingRef}
                tabIndex={-1}
                className="mt-2 text-pretty text-lg font-semibold leading-snug text-foreground outline-none"
            >
                {question.text}
            </h2>

            <div className="mt-3 grid gap-2.5">
                {question.options.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        data-testid="demo-option"
                        disabled={answered}
                        aria-pressed={option.id === selectedOptionId}
                        onClick={() => setSelectedOptionId(option.id)}
                        className={answerOptionClassName(
                            toneFor(option.id),
                            answered,
                        )}
                    >
                        <span className="text-pretty">{option.text}</span>
                    </button>
                ))}
            </div>

            {answered ? (
                <div
                    role="status"
                    data-testid="demo-feedback"
                    data-correct={isCorrect}
                    className={`mt-3 flex flex-wrap items-center justify-between gap-3 ${verdict.plate}`}
                >
                    <div>
                        <p className={verdict.title}>
                            {isCorrect ? labels.correct : labels.wrong}
                        </p>
                        {!isCorrect && correctText ? (
                            <p className="mt-0.5 text-sm text-foreground">
                                {labels.rightAnswer.replace(
                                    '{answer}',
                                    correctText,
                                )}
                            </p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={showNext}
                        className={buttonClassName({
                            variant: 'secondary',
                            className: 'min-h-10 px-3',
                        })}
                    >
                        {dictionary.home.demoNext}
                    </button>
                </div>
            ) : null}
        </section>
    );
}
