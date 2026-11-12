'use client';

/**
 * Игра Classic / Blitz / Daily: один вопрос на экране, ответ фиксируется
 * на сервере сразу (`/api/quiz/:id/answer`), плашка снизу показывает исход.
 *
 * - Первый ответ окончательный: сервер его записал, плашка — его исход.
 * - «Проверяем…» — только если сервер не ответил за 300 мс.
 * - Сбой сети → «Ещё раз» с тем же вариантом (повтор безопасен).
 * - Classic / Daily ждут «Дальше» (или Enter на компьютере — enter-advance);
 *   Блиц идёт дальше сам через 0.8 с и
 *   после последнего ответа сдаёт партию сам.
 * - Блиц 00:00 → auto-submit partial (`finishedByTimer`), как раньше.
 * - Сдача шлёт только сессию: очки сервер считает по зафиксированным ответам.
 * - После F5 игра продолжается с первого неотвеченного (`lockedAnswers`).
 * - Classic / Daily: после записанного ответа — факт «А ты знал?» в плашке
 *   (`useTriviaFacts`), отдельным запросом; «Дальше» его не ждёт. В Блице
 *   фактов в плашке нет (ADR «Did you know: trivia facts»).
 * - AUDIO_GUESS: клипы партии скачиваются при открытии, клип играет сам при
 *   показе вопроса (общий `<audio>`, разблокированный первым тапом).
 *   Блиц: пока игрок на музыкальном вопросе, таймер стоит до окна
 *   прослушивания (та же формула, что у пересчёта при сдаче); клип не
 *   скачался к своему вопросу → вопрос в конец очереди, потом пропуск без
 *   штрафа. ADR: DECISIONS → Audio questions: AUDIO_GUESS.
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
import { QuestionAudio } from '@/features/quiz/components/QuestionAudio';
import { QuestionImage } from '@/features/quiz/components/QuestionImage';
import { TriviaFactNote } from '@/features/quiz/components/TriviaFactNote';
import {
    useQuizAudioClips,
    useQuizAudioPlayer,
} from '@/features/quiz/components/use-quiz-audio';
import { usePreloadQuizImages } from '@/features/quiz/components/use-preload-quiz-images';
import { useTriviaFacts } from '@/features/quiz/components/use-trivia-facts';
import { isEnterAdvance } from '@/features/quiz/lib/enter-advance';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import {
    AUDIO_LISTEN_WINDOW_SECONDS,
    advanceAudioQueue,
    buildListeningClock,
    countAudioQuestions,
    type ListeningLock,
} from '@/features/quiz/lib/listening-window';
import type {
    QuizLockedAnswer,
    QuizPublicQuestion,
} from '@/features/quiz/types';
import { TimedQuizCountdown } from '@/features/timed-mode/components/TimedQuizCountdown';
import { TIMED_MODE_MVP_RULES } from '@/features/timed-mode/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton, buttonClassName } from '@/shared/ui';
import {
    answerOptionClassName,
    answerVerdictClassName,
    type AnswerOptionTone,
} from '@/shared/ui/answer-option';
import { serverNow } from '@/shared/ui/server-clock';
import type { Difficulty } from '@/types';

/** Подсказка клавиши на кнопке перехода — только там, где есть мышь. */
function EnterKeyHint() {
    return (
        <kbd
            aria-hidden
            className="ml-2 hidden rounded-sm border border-current/30 px-1.5 py-0.5 font-mono text-2xs font-medium leading-none opacity-80 fine-pointer:inline-flex"
        >
            Enter ↵
        </kbd>
    );
}

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
/** Сколько видна плашка «клип не загрузился — пропускаем». */
const SKIP_NOTICE_MS = 4000;

type PlayQueue = {
    /** Индексы вопросов в порядке показа (клип не готов → в конец). */
    order: number[];
    /** Позиция текущего вопроса в `order`. */
    position: number;
    /** Вопросы, которые уже раз отложили. */
    deferred: ReadonlySet<number>;
};

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
    const [queue, setQueue] = useState<PlayQueue>(() => ({
        order: questions.map((_, index) => index),
        position: firstUnansweredIndex(questions, toOutcomes(lockedAnswers)),
        deferred: new Set<number>(),
    }));
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
    /** Вопросы, пропущенные из-за клипа (без ответа, без штрафа). */
    const [skipped, setSkipped] = useState<ReadonlySet<string>>(
        () => new Set<string>(),
    );
    const [skipNotice, setSkipNotice] = useState(false);
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
    // Свежие значения для таймера Блица (переход через 0.8 с после ответа).
    const queueRef = useRef(queue);
    const outcomesRef = useRef(outcomes);
    const skippedRef = useRef(skipped);
    const clipReadyRef = useRef<(index: number) => boolean>(() => true);
    const timersRef = useRef<number[]>([]);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const shownIndexRef = useRef(currentIndex);
    const headingId = useId();

    const { facts, requestFact, cancelFact } = useTriviaFacts({
        sessionId,
        locale,
        enabled: !isTimed,
    });

    usePreloadQuizImages(questions.map((question) => question.imageUrl));
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
        queueRef.current = queue;
        outcomesRef.current = outcomes;
        skippedRef.current = skipped;
        clipReadyRef.current = isClipReady;
    });

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

    // Ушли к следующему вопросу раньше, чем пришёл факт, — он уже не нужен.
    useEffect(() => {
        cancelFact();
    }, [cancelFact, currentIndex]);

    const question = questions[currentIndex];
    const outcome = question ? outcomes[question.id] : undefined;
    const isLast = questions.every(
        (item, index) =>
            index === currentIndex || outcomes[item.id] || skipped.has(item.id),
    );
    const answeredCount = Object.keys(outcomes).length;
    const allAnswered = answeredCount + skipped.size >= questions.length;
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

    /**
     * Следующий вопрос. Блиц: клип не скачан → вопрос в конец очереди,
     * второй раз → пропуск. Вопросов не осталось → 'finished'.
     */
    const goNext = useCallback((): 'moved' | 'finished' => {
        setLockError(null);
        const current = queueRef.current;
        const next = advanceAudioQueue({
            order: current.order,
            position: current.position,
            deferred: current.deferred,
            isDone: (index) =>
                Boolean(outcomesRef.current[questions[index]?.id ?? '']) ||
                skippedRef.current.has(questions[index]?.id ?? ''),
            notReady: (index) => isTimed && !clipReadyRef.current(index),
        });
        if (next.skipped.length > 0) {
            const nextSkipped = new Set(skippedRef.current);
            next.skipped.forEach((index) => nextSkipped.add(questions[index].id));
            skippedRef.current = nextSkipped;
            setSkipped(nextSkipped);
            setSkipNotice(true);
            const timer = window.setTimeout(
                () => setSkipNotice(false),
                SKIP_NOTICE_MS,
            );
            timersRef.current.push(timer);
        }
        if (next.position === null) {
            return 'finished';
        }
        const updated = {
            order: next.order,
            position: next.position,
            deferred: next.deferred,
        };
        queueRef.current = updated;
        setQueue(updated);
        return 'moved';
    }, [isTimed, questions]);

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

            // Время ответа по часам сервера — для паузы на музыку на экране.
            const tapAtMs = serverNow();
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
                    const nextOutcomes = {
                        ...outcomesRef.current,
                        [question.id]: {
                            selectedOptionId: body.selectedOption,
                            correctOptionId: body.correctOption,
                            isCorrect: body.correct,
                        },
                    };
                    outcomesRef.current = nextOutcomes;
                    setOutcomes(nextOutcomes);
                    setAnsweredAt((previous) => ({
                        ...previous,
                        [question.id]: tapAtMs,
                    }));
                    // Ответ записан — теперь можно просить факт (без таймера).
                    requestFact(question.id, question.answerKey);

                    if (isTimed) {
                        const timer = window.setTimeout(() => {
                            // Вопросов не осталось (ответы + пропуски) — сдаём.
                            if (goNext() === 'finished') {
                                if (!autoSubmitStartedRef.current) {
                                    autoSubmitStartedRef.current = true;
                                    submit(false);
                                }
                            }
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
            isTimed,
            locale,
            outcome,
            pendingOptionId,
            question,
            requestFact,
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

    /**
     * Enter после ответа = «Дальше» / «К результату» (Classic, Daily).
     * Блиц переходит сам. Та же функция, что у кнопки: сервер и очки не
     * меняются. Кнопки, ссылки и поля обрабатывают Enter сами (enter-advance).
     */
    const canEnterAdvance = Boolean(outcome) && !isTimed && !timedExpired;
    useEffect(() => {
        if (!canEnterAdvance) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof HTMLElement ? event.target : null;
            const targetInfo = target
                ? {
                      tagName: target.tagName,
                      type: target instanceof HTMLInputElement ? target.type : undefined,
                      isContentEditable: target.isContentEditable,
                  }
                : null;
            if (!isEnterAdvance(event, targetInfo)) return;
            event.preventDefault();
            if (!isLast) {
                goNext();
                return;
            }
            if (allAnswered && !isPending) {
                submit(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [allAnswered, canEnterAdvance, goNext, isLast, isPending, submit]);

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

    // Блиц: дедлайн без пауз = потолок `timedEndsAt` − окно × аудиовопросы.
    const audioCount = countAudioQuestions(questions);
    const windowMs = AUDIO_LISTEN_WINDOW_SECONDS * 1000;
    const timedEndsAtMs = timedEndsAt ? new Date(timedEndsAt).getTime() : 0;
    const baseEndsAtMs = timedEndsAtMs - audioCount * windowMs;
    const baseEndsAtIso =
        timedEndsAt && Number.isFinite(baseEndsAtMs)
            ? new Date(baseEndsAtMs).toISOString()
            : timedEndsAt;
    const listeningLocks: ListeningLock[] = questions.flatMap((item) =>
        outcomes[item.id] && answeredAt[item.id] != null
            ? [
                  {
                      questionId: item.id,
                      answeredAtMs: answeredAt[item.id],
                      isAudio: item.type === 'AUDIO_GUESS',
                  },
              ]
            : [],
    );
    // Окно открывается сразу после ответа, если следующий вопрос — музыка.
    const upcomingIndex = outcome
        ? queue.order
              .slice(queue.position + 1)
              .find(
                  (index) =>
                      !outcomes[questions[index].id] &&
                      !skipped.has(questions[index].id),
              )
        : currentIndex;
    const upcoming =
        upcomingIndex != null ? questions[upcomingIndex] : undefined;
    const listening =
        isTimed && audioCount > 0
            ? buildListeningClock({
                  startMs:
                      baseEndsAtMs - TIMED_MODE_MVP_RULES.durationSeconds * 1000,
                  locks: listeningLocks,
                  upcomingIsAudio:
                      upcoming?.type === 'AUDIO_GUESS' &&
                      upcomingIndex != null &&
                      isClipReady(upcomingIndex),
              })
            : undefined;
    const showSoundHint =
        hasAudio &&
        question.type !== 'AUDIO_GUESS' &&
        !questions.some(
            (item) => item.type === 'AUDIO_GUESS' && outcomes[item.id],
        );

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
                                timedEndsAt={baseEndsAtIso ?? timedEndsAt}
                                listening={listening}
                                pausedLabel={dictionary.quiz.audio.clockPaused}
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
                    {showSoundHint ? (
                        <p
                            className="mt-2 text-xs text-muted"
                            data-testid="quiz-audio-sound-hint"
                        >
                            {dictionary.quiz.audio.soundHint}
                        </p>
                    ) : null}
                </div>
            </div>

            <section
                className="pb-48"
                aria-labelledby={headingId}
                data-testid="quiz-question"
                data-index={currentIndex}
            >
                {question.type === 'AUDIO_GUESS' ? (
                    <p
                        className="mb-2 font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted"
                        data-testid="quiz-audio-badge"
                    >
                        {dictionary.quiz.audio.badge}
                    </p>
                ) : null}
                <h2
                    id={headingId}
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-pretty text-lg font-semibold leading-snug text-foreground outline-none sm:text-xl"
                >
                    {question.text}
                </h2>

                {question.type === 'AUDIO_GUESS' && question.audioUrl ? (
                    <div className="mt-4">
                        <QuestionAudio
                            key={question.id}
                            clip={
                                audioClips.clipFor(question.audioUrl) ?? {
                                    status: 'loading',
                                }
                            }
                            controller={audioPlayer}
                            labels={dictionary.quiz.audio}
                            autoPlay
                            onReload={() => {
                                if (question.audioUrl) {
                                    audioClips.reload(question.audioUrl);
                                }
                            }}
                        />
                    </div>
                ) : null}

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
                        data-testid="quiz-feedback"
                        data-correct={outcome.isCorrect}
                        className={`mb-3 ${answerVerdictClassName(outcome.isCorrect).plate}`}
                    >
                        {/* Диктор зачитывает только вердикт; факт ниже — вне status. */}
                        <div role="status">
                            <p
                                className={
                                    answerVerdictClassName(outcome.isCorrect)
                                        .title
                                }
                            >
                                {outcome.isCorrect
                                    ? labels.correct
                                    : labels.wrong}
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
                        {!isTimed && facts[question.id] ? (
                            <TriviaFactNote
                                variant="sheet"
                                label={dictionary.quiz.didYouKnow}
                                text={facts[question.id].text}
                            />
                        ) : null}
                    </div>
                ) : null}

                {skipNotice ? (
                    <InlineAlert
                        className="mb-3"
                        tone="warning"
                        data-testid="quiz-audio-skipped"
                    >
                        {dictionary.quiz.audio.skipped}
                    </InlineAlert>
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
                        onClick={() => {
                            goNext();
                        }}
                    >
                        {labels.next}
                        <EnterKeyHint />
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
                        {isTimed ? null : <EnterKeyHint />}
                    </SubmitButton>
                ) : null}
            </div>
        </form>
    );
}
