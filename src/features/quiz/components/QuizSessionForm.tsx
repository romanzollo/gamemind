'use client';

/**
 * Форма quiz session.
 *
 * Timed: «Завершить» только когда отвечены все; при 00:00 — auto-submit
 * partial → `/result?clock=1` (roast). Late submit после grace тоже на result.
 * Classic/daily: все ответы обязательны; кнопка disabled пока не все.
 */

import { useActionState, useCallback, useMemo, useRef, useState, startTransition } from 'react';

import { submitQuizAction } from '@/features/quiz/actions';
import { QuestionCard } from '@/features/quiz/components/QuestionCard';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { QuizPublicQuestion } from '@/features/quiz/types';
import { TimedQuizCountdown } from '@/features/timed-mode/components/TimedQuizCountdown';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';
import type { Difficulty } from '@/types';

type QuizSessionFormProps = {
    locale: Locale;
    sessionId: string;
    questions: QuizPublicQuestion[];
    /** ISO UTC или null (classic/daily — без countdown). */
    timedEndsAt?: string | null;
    /** Сложность сессии — для Timed rematch на result (prop сохранён для API page). */
    difficulty: Difficulty;
    dictionary: Dictionary;
};

export function QuizSessionForm({
    locale,
    sessionId,
    questions,
    timedEndsAt = null,
    dictionary,
}: QuizSessionFormProps) {
    const isTimed = Boolean(timedEndsAt);
    const formRef = useRef<HTMLFormElement>(null);
    const autoSubmitStartedRef = useRef(false);

    const [state, formAction, isPending] = useActionState(submitQuizAction, {});
    const [selectedAnswers, setSelectedAnswers] = useState<
        Record<string, string>
    >({});
    const [timedExpired, setTimedExpired] = useState(() => {
        if (!timedEndsAt) {
            return false;
        }

        return new Date(timedEndsAt).getTime() <= Date.now();
    });

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
    const submitHintId = 'quiz-submit-hint';
    const progressLabel = `${answeredCount} / ${totalQuestions}`;

    const answersLocked = timedExpired || (isTimed && isPending);

    const handleTimedExpired = useCallback(() => {
        setTimedExpired(true);

        if (autoSubmitStartedRef.current) {
            return;
        }

        autoSubmitStartedRef.current = true;

        const form = formRef.current;
        if (!form) {
            return;
        }

        // FormData + formAction: гарантируем finishedByTimer=1 до POST
        // (скрытый input через setState мог бы не успеть до requestSubmit).
        const formData = new FormData(form);
        formData.set('finishedByTimer', '1');
        startTransition(() => {
            formAction(formData);
        });
    }, [formAction]);

    return (
        <form
            ref={formRef}
            action={formAction}
            noValidate={isTimed}
            className="mt-4 sm:mt-6"
        >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="sessionId" value={sessionId} />

            <div className="sticky top-[var(--site-header-sticky-offset)] z-30 -mx-4 mb-4 border-b border-border bg-background px-4 py-2.5 sm:-mx-8 sm:mb-6 sm:px-8 sm:py-3">
                <div className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
                    {timedEndsAt ? (
                        <div className="mb-2 border-b border-border pb-2">
                            <TimedQuizCountdown
                                timedEndsAt={timedEndsAt}
                                remainingLabel={
                                    dictionary.quiz.timedRemainingLabel
                                }
                                expiredLabel={dictionary.quiz.timedExpiredLabel}
                                onExpired={handleTimedExpired}
                            />
                        </div>
                    ) : null}

                    <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                            {dictionary.quiz.progressAnsweredLabel}
                        </p>
                        <p className="font-mono text-sm tabular-nums text-muted">
                            {progressLabel}
                        </p>
                    </div>
                    <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={totalQuestions}
                        aria-valuenow={answeredCount}
                        aria-label={`${dictionary.quiz.progressAnsweredLabel}: ${progressLabel}`}
                    >
                        <div
                            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-4 pb-40 sm:space-y-6 sm:pb-40">
                {questions.map((question, index) => (
                    <QuestionCard
                        key={question.id}
                        index={index + 1}
                        question={question}
                        selectedOptionId={selectedAnswers[question.id]}
                        imageUrl={question.imageUrl}
                        imageUnavailableLabel={dictionary.quiz.imageUnavailable}
                        imagePriority={
                            index === 0 && Boolean(question.imageUrl)
                        }
                        disabled={answersLocked}
                        onSelectOption={(optionId) => {
                            if (answersLocked) {
                                return;
                            }

                            setSelectedAnswers((current) => ({
                                ...current,
                                [question.id]: optionId,
                            }));
                        }}
                    />
                ))}
            </div>

            <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-8 sm:px-8 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
                {errorMessage ? (
                    <InlineAlert className="mb-3">{errorMessage}</InlineAlert>
                ) : null}

                {isTimed && timedExpired && isPending ? (
                    <p
                        className="mb-2 text-sm leading-snug text-muted sm:mb-3"
                        role="status"
                    >
                        {dictionary.quiz.timedSavingAnswers}
                    </p>
                ) : null}

                {!allAnswered && !timedExpired ? (
                    <p
                        id={submitHintId}
                        className="mb-2 text-sm leading-snug text-muted sm:mb-3"
                    >
                        {dictionary.quiz.errors.answerAll}
                    </p>
                ) : null}

                <SubmitButton
                    disabled={
                        isTimed
                            ? !allAnswered || timedExpired || isPending
                            : !allAnswered
                    }
                    pendingLabel={dictionary.common.submitting}
                    className="w-full"
                    aria-describedby={
                        !allAnswered && !timedExpired
                            ? submitHintId
                            : undefined
                    }
                >
                    {dictionary.quiz.submitButton}
                </SubmitButton>
            </div>
        </form>
    );
}
