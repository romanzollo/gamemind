'use client';

import { useActionState, useState } from 'react';

import { submitQuizAction } from '@/features/quiz/actions';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { QuizPublicQuestion } from '@/features/quiz/types';
import type { Dictionary, Locale } from '@/shared/i18n';

// тип для пропсов компонента QuizSessionForm
type QuizSessionFormProps = {
    locale: Locale;
    sessionId: string;
    questions: QuizPublicQuestion[];
    dictionary: Dictionary;
};

// компонент для формы сессии викторины
export function QuizSessionForm({
    locale,
    sessionId,
    questions,
    dictionary,
}: QuizSessionFormProps) {
    const [state, formAction] = useActionState(submitQuizAction, {});
    const [selectedAnswers, setSelectedAnswers] = useState<
        Record<string, string>
    >({});
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    return (
        <>
            <form action={formAction} className="mt-6 space-y-6">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="sessionId" value={sessionId} />

                {questions.map((question, index) => (
                    <section
                        key={question.id}
                        className="rounded border border-(--border) p-4"
                    >
                        <h2 className="font-medium">
                            {index + 1}. {question.text}
                        </h2>

                        <div className="mt-4 space-y-2">
                            {question.options.map((option) => (
                                <label
                                    key={option.id}
                                    className="flex cursor-pointer items-center gap-2 rounded border border-(--border) p-3 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                >
                                    <input
                                        type="radio"
                                        name={question.id}
                                        value={option.id}
                                        checked={
                                            selectedAnswers[question.id] ===
                                            option.id
                                        }
                                        onChange={() => {
                                            setSelectedAnswers((current) => ({
                                                ...current,
                                                [question.id]: option.id,
                                            }));
                                        }}
                                        required
                                    />
                                    <span>{option.text}</span>
                                </label>
                            ))}
                        </div>
                    </section>
                ))}

                <button
                    type="submit"
                    className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:focus-visible:outline-neutral-100"
                >
                    {dictionary.quiz.submitButton}
                </button>
            </form>

            {errorMessage && (
                <p className="mt-2 text-red-600" role="alert">
                    {errorMessage}
                </p>
            )}
        </>
    );
}
