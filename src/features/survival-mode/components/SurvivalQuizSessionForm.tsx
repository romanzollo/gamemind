'use client';

/**
 * Форма волны Survival.
 *
 * Один вопрос; ответ окончательный. Правильный вариант браузер не знает:
 * ответ уходит на сервер (`/api/quiz/:id/answer`) в фоновой очереди по
 * одному, а следующий вопрос показывается сразу — банк тикает, ждать
 * сервер нельзя. Банк двигается (+4 / −6) по подтверждению сервера, рядом
 * — короткая метка «+4 с / −6 с». Очередь сама повторяет отправку 2 раза,
 * потом «Ещё раз».
 *
 * Банк = UX от startedAt по подтверждённым ответам; авторитет — пересчёт
 * на сдаче (`replaySurvivalWave`). На 0 с ответами в пути ждём их ≤ 3 с:
 * верный ответ может вернуть секунды. Сдача (cut / bank / все ответы) шлёт
 * сессию и флаг конца волны; очки сервер считает по зафиксированным
 * ответам. До startedAt — заставка 3‑2‑1. После F5 — с первого
 * неотвеченного (`lockedAnswers`).
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP; Survival on answer lock-in.
 */

import {
    startTransition,
    useActionState,
    useCallback,
    useEffect,
    useRef,
    useState,
    type FormEvent,
} from 'react';

import type { QuizSessionSurvivalPlayView } from '@/entities/quiz-session/quiz-session.types';
import { submitQuizAction } from '@/features/quiz/actions';
import { QuestionCard } from '@/features/quiz/components/QuestionCard';
import { usePreloadQuizImages } from '@/features/quiz/components/use-preload-quiz-images';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type {
    QuizLockedAnswer,
    QuizPublicQuestion,
} from '@/features/quiz/types';
import { SurvivalQuizBankCountdown } from '@/features/survival-mode/components/SurvivalQuizBankCountdown';
import {
    SurvivalWaveStartCountdown,
    useSurvivalWaveStart,
} from '@/features/survival-mode/components/SurvivalWaveStartCountdown';
import { getSurvivalBankRemainingMs } from '@/features/survival-mode/lib/get-survival-bank-remaining-ms';
import { SURVIVAL_MODE_MVP_RULES } from '@/features/survival-mode/types';
import { formatPlural, type Dictionary, type Locale } from '@/shared/i18n';
import {
    InlineAlert,
    PendingSpinner,
    SubmitButton,
    buttonClassName,
} from '@/shared/ui';
import { serverNow } from '@/shared/ui/server-clock';

type SurvivalWaveEnd = 'cut' | 'bank';

type SurvivalQuizSessionFormProps = {
    locale: Locale;
    sessionId: string;
    questions: QuizPublicQuestion[];
    survival: QuizSessionSurvivalPlayView;
    /** Уже зафиксированные ответы (токены) — продолжение после F5. */
    lockedAnswers?: QuizLockedAnswer[];
    dictionary: Dictionary;
};

type QueuedAnswer = {
    questionId: string;
    optionId: string;
    answerKey: string | undefined;
};

type BankMark = { id: number; correct: boolean };

/** Повторов фоновой отправки до плашки «Ещё раз». */
const LOCK_RETRIES = 2;
const LOCK_RETRY_BASE_MS = 400;
/** Сколько ждать ответы в пути, когда банк показал ноль. */
const EXPIRY_WAIT_MS = 3_000;
const BANK_MARK_MS = 1_200;

function initialChosen(
    lockedAnswers: readonly QuizLockedAnswer[],
): Record<string, string> {
    return Object.fromEntries(
        lockedAnswers.map((answer) => [
            answer.questionId,
            answer.selectedOptionId,
        ]),
    );
}

function initialOutcomes(
    lockedAnswers: readonly QuizLockedAnswer[],
): Record<string, boolean> {
    return Object.fromEntries(
        lockedAnswers.map((answer) => [answer.questionId, answer.isCorrect]),
    );
}

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function SurvivalQuizSessionForm({
    locale,
    sessionId,
    questions,
    survival,
    lockedAnswers = [],
    dictionary,
}: SurvivalQuizSessionFormProps) {
    const labels = dictionary.survivalMode;
    const answerLabels = dictionary.quiz.answer;
    const autoSubmitStartedRef = useRef(false);

    const [state, formAction, isPending] = useActionState(submitQuizAction, {});
    // chosen — выбор игрока (сразу), outcomes — подтверждение сервера.
    const [chosen, setChosen] = useState(() => initialChosen(lockedAnswers));
    const [outcomes, setOutcomes] = useState(() =>
        initialOutcomes(lockedAnswers),
    );
    const [currentIndex, setCurrentIndex] = useState(() => {
        const answered = initialChosen(lockedAnswers);
        const index = questions.findIndex((question) => !answered[question.id]);
        return index === -1 ? Math.max(0, questions.length - 1) : index;
    });
    const [bankExpired, setBankExpired] = useState(false);
    const [waveSubmitting, setWaveSubmitting] = useState(false);
    const [sendFailed, setSendFailed] = useState(false);
    const [bankMark, setBankMark] = useState<BankMark | null>(null);

    // Очередь отправки и свежие значения для обработчиков вне render.
    const queueRef = useRef<QueuedAnswer[]>([]);
    const processingRef = useRef(false);
    const chosenRef = useRef(chosen);
    const outcomesRef = useRef(outcomes);
    const expiryCheckRef = useRef<(() => void) | null>(null);
    const timersRef = useRef<number[]>([]);

    const waveStart = useSurvivalWaveStart(survival.startedAt);
    usePreloadQuizImages(questions.map((question) => question.imageUrl));

    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach((timer) => window.clearTimeout(timer));
        };
    }, []);

    const initialBankSeconds =
        survival.initialBankSeconds ??
        SURVIVAL_MODE_MVP_RULES.initialBankSeconds;
    const correctDeltaSeconds = SURVIVAL_MODE_MVP_RULES.correctDeltaSeconds;
    const wrongDeltaSeconds = SURVIVAL_MODE_MVP_RULES.wrongDeltaSeconds;

    const outcomeValues = Object.values(outcomes);
    const correctCount = outcomeValues.filter(Boolean).length;
    const wrongCount = outcomeValues.length - correctCount;

    const totalQuestions = questions.length;
    const answeredCount = questions.filter(
        (question) => chosen[question.id],
    ).length;
    const allChosen = answeredCount === totalQuestions && totalQuestions > 0;
    const currentQuestion = questions[currentIndex] ?? questions[0];
    const currentChosen = Boolean(
        currentQuestion && chosen[currentQuestion.id],
    );
    // Ошибка hop снимает «идёт отправка»: выводим, а не сбрасываем в effect.
    const waveSaving = waveSubmitting && !state.errorCode;
    const answersLocked = bankExpired || isPending || waveSaving;
    const progressPercent =
        totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);
    const progressLabel = `${answeredCount} / ${totalQuestions}`;
    const showRetryCta = Boolean(state.errorCode) && !isPending;
    const showSavingState =
        (waveSaving || bankExpired || isPending) && !state.errorCode;

    const submitWave = useCallback(
        (waveEnd: SurvivalWaveEnd | null) => {
            if (autoSubmitStartedRef.current) {
                return;
            }
            autoSubmitStartedRef.current = true;
            setWaveSubmitting(true);

            // Очки — по зафиксированным ответам. Выбор в форме нужен только
            // если ни один ответ не дошёл до сервера (старый путь сдачи).
            const formData = new FormData();
            formData.set('locale', locale);
            formData.set('sessionId', sessionId);
            for (const [questionId, optionId] of Object.entries(
                chosenRef.current,
            )) {
                formData.set(questionId, optionId);
            }
            if (waveEnd) {
                formData.set('survivalWaveEnd', waveEnd);
            }
            startTransition(() => {
                formAction(formData);
            });
        },
        [formAction, locale, sessionId],
    );

    const remainingNowMs = useCallback(() => {
        const startedAtMs = new Date(survival.startedAt).getTime();
        if (Number.isNaN(startedAtMs)) {
            return 0;
        }
        const values = Object.values(outcomesRef.current);
        const correct = values.filter(Boolean).length;
        return getSurvivalBankRemainingMs({
            startedAtMs,
            nowMs: serverNow(),
            correctCount: correct,
            wrongCount: values.length - correct,
            initialBankSeconds,
            correctDeltaSeconds,
            wrongDeltaSeconds,
        });
    }, [
        correctDeltaSeconds,
        initialBankSeconds,
        survival.startedAt,
        wrongDeltaSeconds,
    ]);

    const endWaveOnBank = useCallback(() => {
        setBankExpired(true);
        const lockedAll = questions.every(
            (question) => chosenRef.current[question.id],
        );
        submitWave(lockedAll ? 'bank' : 'cut');
    }, [questions, submitWave]);

    /** Очередь опустела: волна кончилась? (все ответы / банк ноль). */
    const afterQueueDrained = useCallback(() => {
        const pendingExpiry = expiryCheckRef.current;
        if (pendingExpiry) {
            expiryCheckRef.current = null;
            pendingExpiry();
            return;
        }
        const lockedAll = questions.every(
            (question) => chosenRef.current[question.id],
        );
        if (lockedAll) {
            // Последний ответ подтверждён — волна кончилась без CTA.
            submitWave(null);
        }
    }, [questions, submitWave]);

    const processQueue = useCallback(async () => {
        if (processingRef.current) {
            return;
        }
        processingRef.current = true;
        setSendFailed(false);

        try {
            while (queueRef.current.length > 0) {
                const item = queueRef.current[0];
                let delivered: boolean | null = null;

                for (
                    let attempt = 0;
                    attempt <= LOCK_RETRIES && delivered === null;
                    attempt += 1
                ) {
                    if (attempt > 0) {
                        await wait(LOCK_RETRY_BASE_MS * attempt);
                    }
                    try {
                        const response = await fetch(
                            `/api/quiz/${encodeURIComponent(sessionId)}/answer`,
                            {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({
                                    question: item.questionId,
                                    option: item.optionId,
                                    key: item.answerKey,
                                }),
                            },
                        );
                        if (response.ok) {
                            const body = (await response.json()) as {
                                correct: boolean;
                            };
                            const next = {
                                ...outcomesRef.current,
                                [item.questionId]: body.correct,
                            };
                            outcomesRef.current = next;
                            setOutcomes(next);
                            setBankMark({
                                id: Date.now(),
                                correct: body.correct,
                            });
                            const timer = window.setTimeout(
                                () => setBankMark(null),
                                BANK_MARK_MS,
                            );
                            timersRef.current.push(timer);
                            delivered = true;
                        } else if (response.status === 409) {
                            // Волна уже сдана (другая вкладка) — её результат.
                            window.location.assign(
                                `/${locale}/result/${sessionId}`,
                            );
                            return;
                        } else if (response.status === 400) {
                            // Ключ не принят — повтор не поможет; ответ не в зачёте.
                            delivered = false;
                        }
                    } catch {
                        // Сеть — следующая попытка.
                    }
                }

                if (delivered === null) {
                    // Повторы кончились: «Ещё раз» продолжит с этого ответа.
                    setSendFailed(true);
                    return;
                }
                queueRef.current.shift();
            }
        } finally {
            processingRef.current = false;
        }

        afterQueueDrained();
    }, [afterQueueDrained, locale, sessionId]);

    const handleBankExpired = useCallback(() => {
        if (queueRef.current.length === 0) {
            endWaveOnBank();
            return;
        }

        // Ответы в пути могут вернуть секунды: ждём их, но не дольше 3 с.
        let settled = false;
        expiryCheckRef.current = () => {
            settled = true;
            // Банк ожил — таймер банка перезапустится от новых счётчиков.
            if (remainingNowMs() <= 0) {
                endWaveOnBank();
            }
        };
        const timer = window.setTimeout(() => {
            if (settled) {
                return;
            }
            // Сеть так и не ответила: волна кончилась по банку. Дошедшие
            // ответы сервер всё равно учтёт по времени фиксации.
            expiryCheckRef.current = null;
            endWaveOnBank();
        }, EXPIRY_WAIT_MS);
        timersRef.current.push(timer);
    }, [endWaveOnBank, remainingNowMs]);

    const handleSelectOption = useCallback(
        (optionId: string) => {
            if (!currentQuestion || answersLocked || currentChosen) {
                return;
            }

            const nextChosen = {
                ...chosenRef.current,
                [currentQuestion.id]: optionId,
            };
            chosenRef.current = nextChosen;
            setChosen(nextChosen);

            queueRef.current.push({
                questionId: currentQuestion.id,
                optionId,
                answerKey: currentQuestion.answerKey,
            });
            void processQueue();

            if (currentIndex < totalQuestions - 1) {
                setCurrentIndex((index) => index + 1);
            }
        },
        [
            answersLocked,
            currentChosen,
            currentIndex,
            currentQuestion,
            processQueue,
            totalQuestions,
        ],
    );

    // F5 после последнего ответа, но до сдачи: волну сдаём сами.
    const [resumedComplete] = useState(
        () =>
            questions.length > 0 &&
            questions.every(
                (question) => initialChosen(lockedAnswers)[question.id],
            ),
    );
    useEffect(() => {
        if (!resumedComplete) {
            return;
        }
        const timer = window.setTimeout(() => submitWave(null), 0);
        return () => window.clearTimeout(timer);
    }, [resumedComplete, submitWave]);

    const handleSubmit = useCallback(
        (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (isPending || !state.errorCode) {
                return;
            }
            // Retry CTA виден только после ошибки hop: явный клик снимает guard.
            autoSubmitStartedRef.current = false;
            const lockedAll = questions.every(
                (question) => chosenRef.current[question.id],
            );
            submitWave(bankExpired ? (lockedAll ? 'bank' : 'cut') : null);
        },
        [bankExpired, isPending, questions, state.errorCode, submitWave],
    );

    if (!currentQuestion) {
        return null;
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="mt-4 sm:mt-6">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="sessionId" value={sessionId} />

            <div className="sticky top-[var(--site-header-sticky-offset)] z-30 -mx-4 mb-4 border-b border-border bg-background px-4 py-2.5 sm:-mx-8 sm:mb-6 sm:px-8 sm:py-3">
                <div className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
                    <div className="relative mb-2 border-b border-border pb-2">
                        <SurvivalQuizBankCountdown
                            startedAt={survival.startedAt}
                            correctCount={correctCount}
                            wrongCount={wrongCount}
                            initialBankSeconds={initialBankSeconds}
                            correctDeltaSeconds={correctDeltaSeconds}
                            wrongDeltaSeconds={wrongDeltaSeconds}
                            remainingLabel={labels.remainingLabel}
                            expiredLabel={labels.expiredLabel}
                            frozen={
                                waveSaving ||
                                isPending ||
                                (allChosen && !bankExpired)
                            }
                            onExpired={handleBankExpired}
                        />
                        {bankMark ? (
                            <span
                                key={bankMark.id}
                                data-testid="survival-bank-mark"
                                className={[
                                    'absolute top-0 right-16 rounded-sm px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums',
                                    bankMark.correct
                                        ? 'bg-success-muted text-success'
                                        : 'bg-danger-muted text-danger',
                                ].join(' ')}
                            >
                                {(bankMark.correct
                                    ? labels.bankGain
                                    : labels.bankLoss
                                ).replace(
                                    '{n}',
                                    String(
                                        bankMark.correct
                                            ? correctDeltaSeconds
                                            : wrongDeltaSeconds,
                                    ),
                                )}
                            </span>
                        ) : null}
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
                {waveStart.started ? (
                    <QuestionCard
                        key={currentQuestion.id}
                        index={currentIndex + 1}
                        question={currentQuestion}
                        selectedOptionId={chosen[currentQuestion.id]}
                        imageUrl={currentQuestion.imageUrl}
                        imageUnavailableLabel={dictionary.quiz.imageUnavailable}
                        imageExpandHint={dictionary.quiz.imageExpandHint}
                        imageExpandLabel={dictionary.quiz.imageExpandLabel}
                        imageCloseLabel={dictionary.quiz.imageCloseLabel}
                        imagePriority={Boolean(currentQuestion.imageUrl)}
                        disabled={answersLocked || currentChosen}
                        onSelectOption={handleSelectOption}
                    />
                ) : (
                    <SurvivalWaveStartCountdown
                        waveLabel={labels.waveLineLabel.replace(
                            '{n}',
                            String(survival.waveIndex),
                        )}
                        secondsLeft={waveStart.secondsLeft}
                        waveFacts={[
                            labels.countdownBank.replace(
                                '{n}',
                                String(initialBankSeconds),
                            ),
                            formatPlural(
                                locale,
                                questions.length,
                                labels.countdownQuestions,
                            ),
                        ]}
                        ruleCorrect={labels.countdownRuleCorrect.replace(
                            '{n}',
                            String(correctDeltaSeconds),
                        )}
                        ruleWrong={labels.countdownRuleWrong.replace(
                            '{n}',
                            String(wrongDeltaSeconds),
                        )}
                    />
                )}
            </div>

            <div className="sticky bottom-0 z-30 -mx-4 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-8 sm:px-8 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
                {sendFailed ? (
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                        <InlineAlert className="flex-1">
                            {answerLabels.sendFailed}
                        </InlineAlert>
                        <button
                            type="button"
                            className={buttonClassName({
                                variant: 'secondary',
                                className: 'min-h-11 px-4',
                            })}
                            onClick={() => {
                                void processQueue();
                            }}
                        >
                            {answerLabels.retry}
                        </button>
                    </div>
                ) : null}

                {errorMessage ? (
                    <InlineAlert className="mb-3">{errorMessage}</InlineAlert>
                ) : null}

                {showSavingState ? (
                    <p
                        className="mb-3 flex min-h-10 items-center justify-center gap-2 text-sm leading-snug text-muted"
                        role="status"
                        aria-live="polite"
                    >
                        <PendingSpinner className="text-primary" />
                        <span>{labels.savingAnswers}</span>
                    </p>
                ) : null}

                {waveStart.started &&
                !allChosen &&
                !bankExpired &&
                !waveSaving ? (
                    <p className="mb-2 text-sm leading-snug text-muted sm:mb-3">
                        {labels.chooseAnswerHint}
                    </p>
                ) : null}

                {showRetryCta ? (
                    <SubmitButton
                        disabled={isPending}
                        pendingLabel={dictionary.common.submitting}
                        className="w-full"
                    >
                        {labels.finishWaveButton}
                    </SubmitButton>
                ) : null}
            </div>
        </form>
    );
}
