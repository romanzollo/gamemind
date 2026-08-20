'use client';

/**
 * Форма волны Survival (волна 1).
 *
 * Последовательный lock-in: один вопрос, ответ сразу фиксируется,
 * верный → +4с к remaining, неверный → −6с, unanswered не штрафуем.
 * Банк = UX от startedAt; сервер remaining не читает.
 * На 0: auto-submit только если все 12 уже lock-in (существующий
 * submitQuizAction требует ANSWER_ALL и не пишет JSONB на complete).
 * Иначе freeze + «время вышло» — partial complete = Chat E.
 * Не звать isSurvivalClockOk на клиенте. Не TimedQuizCountdown.
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP.
 */

import {
    useActionState,
    useCallback,
    useMemo,
    useRef,
    useState,
    startTransition,
    type FormEvent,
} from 'react';

import type { QuizSessionSurvivalPlayView } from '@/entities/quiz-session/quiz-session.types';
import { submitQuizAction } from '@/features/quiz/actions';
import { QuestionCard } from '@/features/quiz/components/QuestionCard';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { QuizPublicQuestion } from '@/features/quiz/types';
import { SurvivalQuizBankCountdown } from '@/features/survival-mode/components/SurvivalQuizBankCountdown';
import { getSurvivalBankRemainingMs } from '@/features/survival-mode/lib/get-survival-bank-remaining-ms';
import { SURVIVAL_MODE_MVP_RULES } from '@/features/survival-mode/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

type SurvivalQuizSessionFormProps = {
    locale: Locale;
    sessionId: string;
    questions: QuizPublicQuestion[];
    survival: QuizSessionSurvivalPlayView;
    dictionary: Dictionary;
};

function isLockedOptionCorrect(
    question: QuizPublicQuestion,
    optionId: string,
): boolean {
    return (
        question.options.find((option) => option.id === optionId)
            ?.isCorrect === true
    );
}

export function SurvivalQuizSessionForm({
    locale,
    sessionId,
    questions,
    survival,
    dictionary,
}: SurvivalQuizSessionFormProps) {
    const labels = dictionary.survivalMode;
    const formRef = useRef<HTMLFormElement>(null);
    const autoSubmitStartedRef = useRef(false);
    const selectedAnswersRef = useRef<Record<string, string>>({});

    const [state, formAction, isPending] = useActionState(submitQuizAction, {});
    const [selectedAnswers, setSelectedAnswers] = useState<
        Record<string, string>
    >({});
    const [currentIndex, setCurrentIndex] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [wrongCount, setWrongCount] = useState(0);
    const [bankExpired, setBankExpired] = useState(false);

    selectedAnswersRef.current = selectedAnswers;

    const totalQuestions = questions.length;
    const answeredCount = useMemo(
        () =>
            questions.filter((question) => selectedAnswers[question.id])
                .length,
        [questions, selectedAnswers],
    );
    const allAnswered = answeredCount === totalQuestions && totalQuestions > 0;
    const currentQuestion = questions[currentIndex] ?? questions[0];
    const currentLocked = Boolean(
        currentQuestion && selectedAnswers[currentQuestion.id],
    );
    const answersLocked = bankExpired || isPending;
    const progressPercent =
        totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);
    const submitHintId = 'survival-submit-hint';
    const progressLabel = `${answeredCount} / ${totalQuestions}`;

    const {
        initialBankSeconds,
        correctDeltaSeconds,
        wrongDeltaSeconds,
    } = SURVIVAL_MODE_MVP_RULES;

    const buildSubmitFormData = useCallback(() => {
        const form = formRef.current;
        const formData = form ? new FormData(form) : new FormData();
        formData.set('locale', locale);
        formData.set('sessionId', sessionId);
        formData.delete('finishedByTimer');

        for (const question of questions) {
            const selectedOptionId = selectedAnswersRef.current[question.id];
            if (selectedOptionId) {
                formData.set(question.id, selectedOptionId);
            } else {
                formData.delete(question.id);
            }
        }

        return formData;
    }, [locale, questions, sessionId]);

    const submitIfAllAnswered = useCallback(() => {
        if (autoSubmitStartedRef.current) {
            return;
        }

        const lockedAll = questions.every(
            (question) => selectedAnswersRef.current[question.id],
        );

        if (!lockedAll) {
            return;
        }

        autoSubmitStartedRef.current = true;
        startTransition(() => {
            formAction(buildSubmitFormData());
        });
    }, [buildSubmitFormData, formAction, questions]);

    const handleBankExpired = useCallback(() => {
        setBankExpired(true);
        submitIfAllAnswered();
    }, [submitIfAllAnswered]);

    const handleSelectOption = useCallback(
        (optionId: string) => {
            if (!currentQuestion || answersLocked || currentLocked) {
                return;
            }

            const isCorrect = isLockedOptionCorrect(currentQuestion, optionId);
            const nextCorrect = correctCount + (isCorrect ? 1 : 0);
            const nextWrong = wrongCount + (isCorrect ? 0 : 1);
            const startedAtMs = new Date(survival.startedAt).getTime();
            const remainingAfterLock = Number.isNaN(startedAtMs)
                ? 0
                : getSurvivalBankRemainingMs({
                      startedAtMs,
                      nowMs: Date.now(),
                      correctCount: nextCorrect,
                      wrongCount: nextWrong,
                      initialBankSeconds,
                      correctDeltaSeconds,
                      wrongDeltaSeconds,
                  });

            const nextAnswers = {
                ...selectedAnswersRef.current,
                [currentQuestion.id]: optionId,
            };
            selectedAnswersRef.current = nextAnswers;
            setSelectedAnswers(nextAnswers);
            setCorrectCount(nextCorrect);
            setWrongCount(nextWrong);

            if (remainingAfterLock <= 0) {
                setBankExpired(true);
                submitIfAllAnswered();
                return;
            }

            if (currentIndex < totalQuestions - 1) {
                setCurrentIndex((index) => index + 1);
            }
        },
        [
            answersLocked,
            correctCount,
            correctDeltaSeconds,
            currentIndex,
            currentLocked,
            currentQuestion,
            initialBankSeconds,
            submitIfAllAnswered,
            survival.startedAt,
            totalQuestions,
            wrongCount,
            wrongDeltaSeconds,
        ],
    );

    const handleSubmit = useCallback(
        (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();

            if (!allAnswered || bankExpired || isPending) {
                return;
            }

            startTransition(() => {
                formAction(buildSubmitFormData());
            });
        },
        [
            allAnswered,
            bankExpired,
            buildSubmitFormData,
            formAction,
            isPending,
        ],
    );

    if (!currentQuestion) {
        return null;
    }

    return (
        <form
            ref={formRef}
            onSubmit={handleSubmit}
            noValidate
            className="mt-4 sm:mt-6"
        >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="sessionId" value={sessionId} />

            <div className="sticky top-[var(--site-header-sticky-offset)] z-30 -mx-4 mb-4 border-b border-border bg-background px-4 py-2.5 sm:-mx-8 sm:mb-6 sm:px-8 sm:py-3">
                <div className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
                    <div className="mb-2 border-b border-border pb-2">
                        <SurvivalQuizBankCountdown
                            startedAt={survival.startedAt}
                            correctCount={correctCount}
                            wrongCount={wrongCount}
                            initialBankSeconds={initialBankSeconds}
                            correctDeltaSeconds={correctDeltaSeconds}
                            wrongDeltaSeconds={wrongDeltaSeconds}
                            remainingLabel={labels.remainingLabel}
                            expiredLabel={labels.expiredLabel}
                            onExpired={handleBankExpired}
                        />
                    </div>

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

            <div className="pb-40 sm:pb-40">
                <QuestionCard
                    index={currentIndex + 1}
                    question={currentQuestion}
                    selectedOptionId={selectedAnswers[currentQuestion.id]}
                    imageUrl={currentQuestion.imageUrl}
                    imageUnavailableLabel={dictionary.quiz.imageUnavailable}
                    imageExpandHint={dictionary.quiz.imageExpandHint}
                    imageExpandLabel={dictionary.quiz.imageExpandLabel}
                    imageCloseLabel={dictionary.quiz.imageCloseLabel}
                    imagePriority={Boolean(currentQuestion.imageUrl)}
                    disabled={answersLocked || currentLocked}
                    onSelectOption={handleSelectOption}
                />
            </div>

            <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-8 sm:px-8 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
                {errorMessage ? (
                    <InlineAlert className="mb-3">{errorMessage}</InlineAlert>
                ) : null}

                {bankExpired && !allAnswered ? (
                    <p
                        className="mb-2 text-sm leading-snug text-muted sm:mb-3"
                        role="status"
                    >
                        {labels.timeUpHint}
                    </p>
                ) : null}

                {bankExpired && allAnswered && isPending ? (
                    <p
                        className="mb-2 text-sm leading-snug text-muted sm:mb-3"
                        role="status"
                    >
                        {labels.savingAnswers}
                    </p>
                ) : null}

                {!allAnswered && !bankExpired ? (
                    <p
                        id={submitHintId}
                        className="mb-2 text-sm leading-snug text-muted sm:mb-3"
                    >
                        {dictionary.quiz.errors.answerAll}
                    </p>
                ) : null}

                <SubmitButton
                    disabled={!allAnswered || bankExpired || isPending}
                    pendingLabel={dictionary.common.submitting}
                    className="w-full"
                    aria-describedby={
                        !allAnswered && !bankExpired
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
