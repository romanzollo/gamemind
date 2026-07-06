'use client';

import { useActionState, useState } from 'react';

import { submitQuizAction } from '@/features/quiz/actions';
import { QuestionCard } from '@/features/quiz/components/QuestionCard';
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

                {/* карточки вопросов */}
                {questions.map((question, index) => (
                    <QuestionCard
                        key={question.id}
                        index={index + 1}
                        question={question}
                        selectedOptionId={selectedAnswers[question.id]}
                        onSelectOption={(optionId) => {
                            setSelectedAnswers((current) => ({
                                ...current,
                                [question.id]: optionId,
                            }));
                        }}
                    />
                ))}

                <button
                    type="submit"
                    className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                    {dictionary.quiz.submitButton}
                </button>
            </form>

            {errorMessage && (
                <p
                    className="mt-2 rounded-sm bg-danger-muted px-3 py-2 text-sm text-danger"
                    role="alert"
                >
                    {errorMessage}
                </p>
            )}
        </>
    );
}
