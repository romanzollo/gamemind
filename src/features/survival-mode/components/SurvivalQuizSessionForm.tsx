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
 * AUDIO_GUESS: клипы волны скачиваются во время заставки; пока игрок на
 * музыкальном вопросе, банк стоит до окна прослушивания (та же формула, что
 * у `replaySurvivalWave`). Клип не скачался к своему вопросу → вопрос в
 * конец волны, потом пропуск без штрафа (без −6 и без потери банка).
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP; Survival on answer lock-in;
 * Audio questions: AUDIO_GUESS.
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
import { QuestionAudio } from '@/features/quiz/components/QuestionAudio';
import { QuestionCard } from '@/features/quiz/components/QuestionCard';
import {
    useQuizAudioClips,
    useQuizAudioPlayer,
} from '@/features/quiz/components/use-quiz-audio';
import {
    advanceAudioQueue,
    buildListeningClock,
    type ListeningLock,
} from '@/features/quiz/lib/listening-window';
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
/** Сколько видна плашка «клип не загрузился — пропускаем». */
const SKIP_NOTICE_MS = 4_000;

type PlayQueue = {
    /** Индексы вопросов в порядке показа (клип не готов → в конец). */
    order: number[];
    /** Позиция текущего вопроса в `order`. */
    position: number;
    deferred: ReadonlySet<number>;
};

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
    const [queue, setQueue] = useState<PlayQueue>(() => {
        const answered = initialChosen(lockedAnswers);
        const index = questions.findIndex((question) => !answered[question.id]);
        return {
            order: questions.map((_, position) => position),
            position: index === -1 ? Math.max(0, questions.length - 1) : index,
            deferred: new Set<number>(),
        };
    });
    const currentIndex = queue.order[queue.position] ?? 0;
    /** Время ответа (мс, часы сервера): после F5 — фиксация, иначе тап. */
    const [answeredAt, setAnsweredAt] = useState<Record<string, number>>(() =>
        Object.fromEntries(
            lockedAnswers.flatMap((answer) =>
                answer.answeredAtMs != null
                    ? [[answer.questionId, answer.answeredAtMs]]
                    : [],
            ),
        ),
    );
    /** Вопросы, пропущенные из-за клипа (без ответа и без штрафа). */
    const [skipped, setSkipped] = useState<ReadonlySet<string>>(
        () => new Set<string>(),
    );
    const [skipNotice, setSkipNotice] = useState(false);
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
    const skippedRef = useRef(skipped);
    const listeningRef = useRef<(nowMs: number) => { creditMs: number }>(
        () => ({ creditMs: 0 }),
    );
    const timersRef = useRef<number[]>([]);

    const waveStart = useSurvivalWaveStart(survival.startedAt);
    usePreloadQuizImages(questions.map((question) => question.imageUrl));
    // Клипы волны скачиваются сразу — во время заставки 3‑2‑1.
    const audioUrls = questions.map((item) =>
        item.type === 'AUDIO_GUESS' ? item.audioUrl : null,
    );
    const hasAudio = audioUrls.some(Boolean);
    const audioClips = useQuizAudioClips(audioUrls);
    const audioPlayer = useQuizAudioPlayer(hasAudio);
    const isClipReady = useCallback(
        (index: number) => {
            const item = questions[index];
            if (!item || item.type !== 'AUDIO_GUESS') return true;
            return audioClips.clipFor(item.audioUrl)?.status === 'ready';
        },
        [audioClips, questions],
    );

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
    const allChosen =
        answeredCount + skipped.size >= totalQuestions && totalQuestions > 0;
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
        const nowMs = serverNow();
        return getSurvivalBankRemainingMs({
            startedAtMs,
            nowMs,
            correctCount: correct,
            wrongCount: values.length - correct,
            initialBankSeconds,
            correctDeltaSeconds,
            wrongDeltaSeconds,
            creditMs: listeningRef.current(nowMs).creditMs,
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
            (question) =>
                chosenRef.current[question.id] ||
                skippedRef.current.has(question.id),
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
            (question) =>
                chosenRef.current[question.id] ||
                skippedRef.current.has(question.id),
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

            const tapAtMs = serverNow();
            setAnsweredAt((previous) => ({
                ...previous,
                [currentQuestion.id]: tapAtMs,
            }));

            queueRef.current.push({
                questionId: currentQuestion.id,
                optionId,
                answerKey: currentQuestion.answerKey,
            });
            void processQueue();

            // Следующий вопрос сразу: клип не скачан → в конец волны,
            // второй раз → пропуск без штрафа.
            const next = advanceAudioQueue({
                order: queue.order,
                position: queue.position,
                deferred: queue.deferred,
                isDone: (index) =>
                    Boolean(nextChosen[questions[index]?.id ?? '']) ||
                    skippedRef.current.has(questions[index]?.id ?? ''),
                notReady: (index) => !isClipReady(index),
            });
            if (next.skipped.length > 0) {
                const nextSkipped = new Set(skippedRef.current);
                next.skipped.forEach((index) =>
                    nextSkipped.add(questions[index].id),
                );
                skippedRef.current = nextSkipped;
                setSkipped(nextSkipped);
                setSkipNotice(true);
                const timer = window.setTimeout(
                    () => setSkipNotice(false),
                    SKIP_NOTICE_MS,
                );
                timersRef.current.push(timer);
            }
            if (next.position !== null) {
                setQueue({
                    order: next.order,
                    position: next.position,
                    deferred: next.deferred,
                });
            }
        },
        [
            answersLocked,
            currentChosen,
            currentQuestion,
            isClipReady,
            processQueue,
            queue,
            questions,
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

    // Банк на экране: паузы отвеченных аудиовопросов + окно, если сейчас
    // музыкальный вопрос с готовым клипом. Формула — как на сервере.
    const listeningLocks: ListeningLock[] = questions.flatMap((item) =>
        chosen[item.id] && answeredAt[item.id] != null
            ? [
                  {
                      questionId: item.id,
                      answeredAtMs: answeredAt[item.id],
                      isAudio: item.type === 'AUDIO_GUESS',
                  },
              ]
            : [],
    );
    const waveStartedAtMs = new Date(survival.startedAt).getTime();
    const listening = hasAudio
        ? buildListeningClock({
              startMs: waveStartedAtMs,
              locks: listeningLocks,
              upcomingIsAudio:
                  waveStart.started &&
                  currentQuestion?.type === 'AUDIO_GUESS' &&
                  !chosen[currentQuestion.id] &&
                  isClipReady(currentIndex),
          })
        : undefined;

    useEffect(() => {
        skippedRef.current = skipped;
        listeningRef.current = listening ?? (() => ({ creditMs: 0 }));
    });
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
                            listening={listening}
                            pausedLabel={dictionary.quiz.audio.clockPaused}
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
                        eyebrow={
                            currentQuestion.type === 'AUDIO_GUESS'
                                ? dictionary.quiz.audio.badge
                                : undefined
                        }
                        media={
                            currentQuestion.type === 'AUDIO_GUESS' &&
                            currentQuestion.audioUrl ? (
                                <QuestionAudio
                                    clip={
                                        audioClips.clipFor(
                                            currentQuestion.audioUrl,
                                        ) ?? { status: 'loading' }
                                    }
                                    controller={audioPlayer}
                                    labels={dictionary.quiz.audio}
                                    autoPlay
                                />
                            ) : undefined
                        }
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
                            ...(hasAudio
                                ? [dictionary.quiz.audio.soundHint]
                                : []),
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
                {skipNotice ? (
                    <InlineAlert
                        className="mb-3"
                        tone="warning"
                        data-testid="quiz-audio-skipped"
                    >
                        {dictionary.quiz.audio.skipped}
                    </InlineAlert>
                ) : null}

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
