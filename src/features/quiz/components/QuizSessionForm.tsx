'use client';

/**
 * Форма quiz session.
 *
 * Timed: при 00:00 — auto-submit текущих ответов (partial OK на сервере),
 * ответы блокируются; если всё же TIMED_OUT (после grace) — recovery CTA,
 * без «живой» кнопки Завершить.
 * Classic/daily: поведение без изменений (все ответы обязательны на сервере).
 */

import { useActionState, useCallback, useMemo, useRef, useState, startTransition } from 'react';

import { submitQuizAction } from '@/features/quiz/actions';
import { QuestionCard } from '@/features/quiz/components/QuestionCard';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { QuizPublicQuestion } from '@/features/quiz/types';
import { TimedQuizCountdown } from '@/features/timed-mode/components/TimedQuizCountdown';
import { TimedRematchButton } from '@/features/timed-mode/components/TimedRematchButton';
import type { Dictionary, Locale } from '@/shared/i18n';
import {
    InlineAlert,
    PendingLink,
    SubmitButton,
    buttonClassName,
} from '@/shared/ui';
import type { Difficulty } from '@/types';

type QuizSessionFormProps = {
    locale: Locale;
    sessionId: string;
    questions: QuizPublicQuestion[];
    /** ISO UTC или null (classic/daily — без countdown). */
    timedEndsAt?: string | null;
    /** Сложность сессии — для Timed rematch после TIMED_OUT. */
    difficulty: Difficulty;
    dictionary: Dictionary;
};

export function QuizSessionForm({
    locale,
    sessionId,
    questions,
    timedEndsAt = null,
    difficulty,
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

    const timedOut = state.errorCode === 'TIMED_OUT';
    const answersLocked = timedExpired || timedOut || (isTimed && isPending);
    const showTimedRecovery = timedOut;

    const handleTimedExpired = useCallback(() => {
        setTimedExpired(true);

        if (autoSubmitStartedRef.current || timedOut) {
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
    }, [formAction, timedOut]);

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

                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-foreground">
                            {dictionary.quiz.progressAnsweredLabel}
                        </span>
                        <span className="tabular-nums font-semibold text-foreground">
                            {progressLabel}
                        </span>
                    </div>

                    <div
                        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted"
                        role="progressbar"
                        aria-valuenow={answeredCount}
                        aria-valuemin={0}
                        aria-valuemax={totalQuestions}
                        aria-label={progressLabel}
                    >
                        <div
                            className="h-full rounded-full bg-primary motion-safe:transition-[width]"
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
                {showTimedRecovery ? (
                    <div className="space-y-3">
                        <InlineAlert>
                            {dictionary.quiz.timedExpiredBody}
                        </InlineAlert>
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
                            <TimedRematchButton
                                locale={locale}
                                difficulty={difficulty}
                                label={dictionary.quiz.timedTryAgain}
                                dictionary={dictionary}
                            />
                            <PendingLink
                                href={`/${locale}`}
                                className={buttonClassName({
                                    variant: 'secondary',
                                    className: 'w-full sm:w-auto',
                                })}
                            >
                                {dictionary.quiz.backHome}
                            </PendingLink>
                        </div>
                    </div>
                ) : (
                    <>
                        {errorMessage ? (
                            <InlineAlert className="mb-3">
                                {errorMessage}
                            </InlineAlert>
                        ) : null}

                        {isTimed && timedExpired && isPending ? (
                            <p
                                className="mb-2 text-sm leading-snug text-muted sm:mb-3"
                                role="status"
                            >
                                {dictionary.quiz.timedSavingAnswers}
                            </p>
                        ) : null}

                        {!isTimed && !allAnswered ? (
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
                                    ? timedExpired || isPending
                                    : !allAnswered
                            }
                            pendingLabel={dictionary.common.submitting}
                            className="w-full"
                            aria-describedby={
                                !isTimed && !allAnswered
                                    ? submitHintId
                                    : undefined
                            }
                        >
                            {dictionary.quiz.submitButton}
                        </SubmitButton>
                    </>
                )}
            </div>
        </form>
    );
}
