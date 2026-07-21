'use client';

import { useActionState, useMemo, useState } from 'react';

import { submitQuizAction } from '@/features/quiz/actions';
import { QuestionCard } from '@/features/quiz/components/QuestionCard';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { QuizPublicQuestion } from '@/features/quiz/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';

type QuizSessionFormProps = {
    locale: Locale;
    sessionId: string;
    questions: QuizPublicQuestion[];
    dictionary: Dictionary;
};

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

    const answeredCount = useMemo(
        () =>
            questions.filter((question) => selectedAnswers[question.id])
                .length,
        [questions, selectedAnswers],
    );

    const totalQuestions = questions.length;
    const allAnswered = answeredCount === totalQuestions;
    const progressPercent =
        totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    return (
        <form action={formAction} className="mt-6">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="sessionId" value={sessionId} />

            <div className="mb-6 rounded-lg bg-surface-muted p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground">
                        {dictionary.quiz.questionCountLabel}
                    </span>
                    <span className="tabular-nums text-muted">
                        {answeredCount} / {totalQuestions}
                    </span>
                </div>

                <div
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-valuenow={answeredCount}
                    aria-valuemin={0}
                    aria-valuemax={totalQuestions}
                    aria-label={`${answeredCount} / ${totalQuestions}`}
                >
                    <div
                        className="h-full rounded-full bg-primary motion-safe:transition-[width]"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            <div className="space-y-6 pb-28 sm:pb-32">
                {questions.map((question, index) => (
                    <QuestionCard
                        key={question.id}
                        index={index + 1}
                        question={question}
                        selectedOptionId={selectedAnswers[question.id]}
                        imageUrl={question.imageUrl}
                        imageUnavailableLabel={dictionary.quiz.imageUnavailable}
                        imagePriority={index === 0 && Boolean(question.imageUrl)}
                        onSelectOption={(optionId) => {
                            setSelectedAnswers((current) => ({
                                ...current,
                                [question.id]: optionId,
                            }));
                        }}
                    />
                ))}
            </div>

            <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:px-0">
                {errorMessage ? (
                    <p
                        className="mb-3 rounded-md bg-danger-muted px-3 py-2 text-sm text-danger"
                        role="alert"
                    >
                        {errorMessage}
                    </p>
                ) : null}

                <SubmitButton
                    disabled={!allAnswered}
                    pendingLabel={dictionary.common.submitting}
                    className="w-full sm:w-auto"
                >
                    {dictionary.quiz.submitButton}
                </SubmitButton>
            </div>
        </form>
    );
}
