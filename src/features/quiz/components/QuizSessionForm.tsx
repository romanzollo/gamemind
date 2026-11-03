'use client';

/**
 * Игра Classic / Blitz / Daily: один вопрос на экране, ответ фиксируется
 * на сервере сразу (`/api/quiz/:id/answer`), плашка снизу показывает исход.
 *
 * - Первый ответ окончательный: сервер его записал, плашка — его исход.
 * - «Проверяем…» — только если сервер не ответил за 300 мс.
 * - Сбой сети → «Ещё раз» с тем же вариантом (повтор безопасен).
 * - Classic / Daily ждут «Дальше»; Блиц идёт дальше сам через 0.8 с и
 *   после последнего ответа сдаёт партию сам.
 * - Блиц 00:00 → auto-submit partial (`finishedByTimer`), как раньше.
 * - Сдача шлёт только сессию: очки сервер считает по зафиксированным ответам.
 * - После F5 игра продолжается с первого неотвеченного (`lockedAnswers`).
 *
 * Canon: docs/DECISIONS.md → Answer lock-in; QUIZ_NEON_HOT_PATH → E2.
 */

import {
    startTransition,
    useActionState,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type FormEvent,
} from 'react';

import { submitQuizAction } from '@/features/quiz/actions';
import { QuestionImage } from '@/features/quiz/components/QuestionImage';
import { usePreloadQuizImages } from '@/features/quiz/components/use-preload-quiz-images';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type {
    QuizLockedAnswer,
    QuizPublicQuestion,
} from '@/features/quiz/types';
import { TimedQuizCountdown } from '@/features/timed-mode/components/TimedQuizCountdown';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton, buttonClassName } from '@/shared/ui';
import {
    answerOptionClassName,
    answerVerdictClassName,
    type AnswerOptionTone,
} from '@/shared/ui/answer-option';
import { serverNow } from '@/shared/ui/server-clock';
import type { Difficulty } from '@/types';

type QuizSessionFormProps = {
    locale: Locale;
    sessionId: string;
    questions: QuizPublicQuestion[];
    /** ISO UTC или null (classic/daily — без countdown). */
    timedEndsAt?: string | null;
    /** Сложность сессии; null = mix. Prop сохранён для API page (форма его не читает). */
    difficulty: Difficulty | null;
    /** Уже зафиксированные ответы (токены) — продолжение после обновления. */
    lockedAnswers?: QuizLockedAnswer[];
    dictionary: Dictionary;
};

type AnswerOutcome = {
    selectedOptionId: string;
    correctOptionId: string;
    isCorrect: boolean;
};

type LockError = 'failed' | 'time_up' | null;

type LockResponse = {
    correct: boolean;
    correctOption: string;
    selectedOption: string;
};

/** Меньше — «Проверяем…» мигает на каждом быстром ответе. */
const CHECKING_DELAY_MS = 300;
/** Блиц: сколько видна плашка до следующего вопроса. */
const BLITZ_ADVANCE_MS = 800;

function toOutcomes(
    lockedAnswers: readonly QuizLockedAnswer[],
): Record<string, AnswerOutcome> {
    return Object.fromEntries(
        lockedAnswers.map((answer) => [
            answer.questionId,
            {
                selectedOptionId: answer.selectedOptionId,
                correctOptionId: answer.correctOptionId,
                isCorrect: answer.isCorrect,
            },
        ]),
    );
}

function firstUnansweredIndex(
    questions: readonly QuizPublicQuestion[],
    outcomes: Record<string, AnswerOutcome>,
): number {
    const index = questions.findIndex((question) => !outcomes[question.id]);
    return index === -1 ? Math.max(0, questions.length - 1) : index;
}

export function QuizSessionForm({
    locale,
    sessionId,
    questions,
    timedEndsAt = null,
    lockedAnswers = [],
    dictionary,
}: QuizSessionFormProps) {
    const isTimed = Boolean(timedEndsAt);
    const labels = dictionary.quiz.answer;
    const [state, formAction, isPending] = useActionState(submitQuizAction, {});

    const [outcomes, setOutcomes] = useState(() => toOutcomes(lockedAnswers));
    const [currentIndex, setCurrentIndex] = useState(() =>
        firstUnansweredIndex(questions, toOutcomes(lockedAnswers)),
    );
    const [pendingOptionId, setPendingOptionId] = useState<string | null>(null);
    const [retryOptionId, setRetryOptionId] = useState<string | null>(null);
    const [showChecking, setShowChecking] = useState(false);
    const [lockError, setLockError] = useState<LockError>(null);
    const [timedExpired, setTimedExpired] = useState(() => {
        if (!timedEndsAt) {
            return false;
        }
        return new Date(timedEndsAt).getTime() <= serverNow();
    });

    const autoSubmitStartedRef = useRef(false);
    const timersRef = useRef<number[]>([]);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const shownIndexRef = useRef(currentIndex);
    const headingId = useId();

    usePreloadQuizImages(questions.map((question) => question.imageUrl));

    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, []);

    // Новый вопрос — фокус на его тексте (клавиатура и экранный диктор),
    // но не при первой отрисовке: страницу не дёргаем.
    useEffect(() => {
        if (shownIndexRef.current !== currentIndex) {
            shownIndexRef.current = currentIndex;
            headingRef.current?.focus({ preventScroll: true });
        }
    }, [currentIndex]);

    const question = questions[currentIndex];
    const outcome = question ? outcomes[question.id] : undefined;
    const isLast = currentIndex >= questions.length - 1;
    const answeredCount = Object.keys(outcomes).length;
    const allAnswered = answeredCount >= questions.length;
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    // Серия верных подряд, заканчивающаяся на текущем вопросе.
    let streak = 0;
    for (let index = currentIndex; index >= 0; index -= 1) {
        if (!outcomes[questions[index].id]?.isCorrect) {
            break;
        }
        streak += 1;
    }

    const submit = useCallback(
        (finishedByTimer: boolean) => {
            const formData = new FormData();
            formData.set('locale', locale);
            formData.set('sessionId', sessionId);
            if (finishedByTimer) {
                formData.set('finishedByTimer', '1');
            }
            startTransition(() => {
                formAction(formData);
            });
        },
        [formAction, locale, sessionId],
    );

    const handleTimedExpired = useCallback(() => {
        setTimedExpired(true);
        if (autoSubmitStartedRef.current) {
            return;
        }
        autoSubmitStartedRef.current = true;
        submit(true);
    }, [submit]);

    const goNext = useCallback(() => {
        setLockError(null);
        setCurrentIndex((index) => Math.min(index + 1, questions.length - 1));
    }, [questions.length]);

    const sendAnswer = useCallback(
        async (optionId: string) => {
            if (!question || outcome || pendingOptionId || timedExpired) {
                return;
            }
            if (!question.answerKey) {
                setRetryOptionId(optionId);
                setLockError('failed');
                return;
            }

            const answeredLast = isLast;
            setPendingOptionId(optionId);
            setLockError(null);
            const checkingTimer = window.setTimeout(
                () => setShowChecking(true),
                CHECKING_DELAY_MS,
            );

            try {
                const response = await fetch(
                    `/api/quiz/${encodeURIComponent(sessionId)}/answer`,
                    {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                            question: question.id,
                            option: optionId,
                            key: question.answerKey,
                        }),
                    },
                );

                if (response.ok) {
                    const body = (await response.json()) as LockResponse;
                    setRetryOptionId(null);
                    setOutcomes((previous) => ({
                        ...previous,
                        [question.id]: {
                            selectedOptionId: body.selectedOption,
                            correctOptionId: body.correctOption,
                            isCorrect: body.correct,
                        },
                    }));

                    if (isTimed) {
                        const timer = window.setTimeout(() => {
                            if (answeredLast) {
                                if (!autoSubmitStartedRef.current) {
                                    autoSubmitStartedRef.current = true;
                                    submit(false);
                                }
                                return;
                            }
                            goNext();
                        }, BLITZ_ADVANCE_MS);
                        timersRef.current.push(timer);
                    }
                    return;
                }

                const body = (await response.json().catch(() => null)) as {
                    error?: string;
                } | null;

                if (response.status === 409 && body?.error === 'TIME_UP') {
                    setLockError('time_up');
                    handleTimedExpired();
                    return;
                }
                if (response.status === 409) {
                    // Партия уже сдана (другая вкладка) — её результат.
                    window.location.assign(`/${locale}/result/${sessionId}`);
                    return;
                }

                setRetryOptionId(optionId);
                setLockError('failed');
            } catch {
                setRetryOptionId(optionId);
                setLockError('failed');
            } finally {
                window.clearTimeout(checkingTimer);
                setShowChecking(false);
                setPendingOptionId(null);
            }
        },
        [
            goNext,
            handleTimedExpired,
            isLast,
            isTimed,
            locale,
            outcome,
            pendingOptionId,
            question,
            sessionId,
            submit,
            timedExpired,
        ],
    );

    const handleSubmit = useCallback(
        (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (isPending) {
                return;
            }
            // После 00:00 кнопка — повтор упавшего auto-submit (partial).
            if (timedExpired || allAnswered) {
                submit(timedExpired);
            }
        },
        [allAnswered, isPending, submit, timedExpired],
    );

    if (!question) {
        return null;
    }

    const optionsLocked =
        Boolean(outcome) || pendingOptionId !== null || timedExpired;
    const correctOptionText = outcome
        ? question.options.find(
              (option) => option.id === outcome.correctOptionId,
          )?.text
        : undefined;
    const progressText = labels.progress
        .replace('{n}', String(currentIndex + 1))
        .replace('{total}', String(questions.length));

    return (
        <form
            onSubmit={handleSubmit}
            noValidate
            className="mt-4 sm:mt-6"
            data-testid="quiz-play"
            data-total={questions.length}
        >
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

                    <p className="text-sm font-medium text-foreground">
                        {progressText}
                    </p>
                    <ol className="mt-2 flex gap-1" aria-label={progressText}>
                        {questions.map((item, index) => {
                            const itemOutcome = outcomes[item.id];
                            const tone = itemOutcome
                                ? itemOutcome.isCorrect
                                    ? 'bg-success'
                                    : 'bg-danger'
                                : index === currentIndex
                                  ? 'bg-foreground'
                                  : 'bg-surface-muted';
                            return (
                                <li
                                    key={item.id}
                                    className={`h-1.5 flex-1 rounded-full ${tone}`}
                                />
                            );
                        })}
                    </ol>
                </div>
            </div>

            <section
                className="pb-48"
                aria-labelledby={headingId}
                data-testid="quiz-question"
                data-index={currentIndex}
            >
                <h2
                    id={headingId}
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-pretty text-lg font-semibold leading-snug text-foreground outline-none sm:text-xl"
                >
                    {question.text}
                </h2>

                {question.imageUrl ? (
                    <div className="mt-4">
                        <QuestionImage
                            key={question.id}
                            src={question.imageUrl}
                            alt={question.text}
                            unavailableLabel={dictionary.quiz.imageUnavailable}
                            priority
                            expandHint={dictionary.quiz.imageExpandHint}
                            expandLabel={dictionary.quiz.imageExpandLabel}
                            closeLabel={dictionary.quiz.imageCloseLabel}
                        />
                    </div>
                ) : null}

                <div className="mt-4 grid gap-2.5">
                    {question.options.map((option) => {
                        const isPendingChoice = pendingOptionId === option.id;
                        const isCorrectOption =
                            outcome?.correctOptionId === option.id;
                        const isWrongChoice =
                            outcome != null &&
                            outcome.selectedOptionId === option.id &&
                            !outcome.isCorrect;
                        const tone: AnswerOptionTone = isCorrectOption
                            ? 'correct'
                            : isWrongChoice
                              ? 'wrong'
                              : isPendingChoice
                                ? 'pending'
                                : outcome
                                  ? 'dimmed'
                                  : 'idle';

                        return (
                            <button
                                key={option.id}
                                type="button"
                                data-testid="quiz-option"
                                disabled={optionsLocked}
                                aria-pressed={
                                    isPendingChoice ||
                                    outcome?.selectedOptionId === option.id
                                }
                                onClick={() => {
                                    void sendAnswer(option.id);
                                }}
                                className={answerOptionClassName(
                                    tone,
                                    optionsLocked,
                                )}
                            >
                                <span className="text-pretty">
                                    {option.text}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-8 sm:px-8 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
                {outcome ? (
                    <div
                        role="status"
                        data-testid="quiz-feedback"
                        data-correct={outcome.isCorrect}
                        className={`mb-3 ${answerVerdictClassName(outcome.isCorrect).plate}`}
                    >
                        <p
                            className={
                                answerVerdictClassName(outcome.isCorrect).title
                            }
                        >
                            {outcome.isCorrect ? labels.correct : labels.wrong}
                            {streak >= 3 ? (
                                <span className="ml-2 text-sm font-medium text-foreground">
                                    {labels.streak.replace(
                                        '{count}',
                                        String(streak),
                                    )}
                                </span>
                            ) : null}
                        </p>
                        {!outcome.isCorrect && correctOptionText ? (
                            <p className="mt-0.5 text-sm text-foreground">
                                {labels.rightAnswer.replace(
                                    '{answer}',
                                    correctOptionText,
                                )}
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {showChecking ? (
                    <p className="mb-3 text-sm text-muted" role="status">
                        {labels.checking}
                    </p>
                ) : null}

                {lockError === 'failed' ? (
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                        <InlineAlert className="flex-1">
                            {labels.sendFailed}
                        </InlineAlert>
                        {retryOptionId ? (
                            <button
                                type="button"
                                className={buttonClassName({
                                    variant: 'secondary',
                                    className: 'min-h-11 px-4',
                                })}
                                onClick={() => {
                                    setLockError(null);
                                    void sendAnswer(retryOptionId);
                                }}
                            >
                                {labels.retry}
                            </button>
                        ) : null}
                    </div>
                ) : null}

                {lockError === 'time_up' ? (
                    <InlineAlert className="mb-3" tone="warning">
                        {labels.timeUp}
                    </InlineAlert>
                ) : null}

                {errorMessage ? (
                    <InlineAlert className="mb-3">{errorMessage}</InlineAlert>
                ) : null}

                {isTimed && timedExpired && isPending ? (
                    <p className="mb-3 text-sm text-muted" role="status">
                        {dictionary.quiz.timedSavingAnswers}
                    </p>
                ) : null}

                {outcome && !isLast && !timedExpired ? (
                    <button
                        type="button"
                        data-testid="quiz-next"
                        className={buttonClassName({ className: 'w-full' })}
                        onClick={goNext}
                    >
                        {labels.next}
                    </button>
                ) : null}

                {(outcome && isLast) || timedExpired ? (
                    <SubmitButton
                        disabled={
                            isPending ||
                            (timedExpired ? !state.errorCode : !allAnswered)
                        }
                        pendingLabel={dictionary.common.submitting}
                        className="w-full"
                        data-testid="quiz-submit"
                    >
                        {labels.toResult}
                    </SubmitButton>
                ) : null}
            </div>
        </form>
    );
}
