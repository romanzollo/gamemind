'use client';

/**
 * Игра в комнате (макет v2, экраны 3–4): отсчёт, показ вопроса, ответы и
 * разбор. Фаза — из расписания по серверным часам; данные фазы (текст,
 * варианты, верный ответ) приносит опрос.
 *
 * Ответ: касание → вариант подсвечен, короткая вибрация, запрос на сервер
 * (сбой сети — ещё 2 попытки сами, потом «Нажми ещё раз»). Верный ответ
 * никто не видит до конца приёма — его присылает разбор. Разбор: счётчик
 * «+870», полоски «кто что выбрал», таблица переезжает со старых мест на
 * новые, плашка цели «до 1-го места …».
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { useEffect, useState } from 'react';

import { QuestionImage } from '@/features/quiz/components/QuestionImage';
import { postRoom } from '@/features/quiz-room/components/use-room-state';
import {
    EYEBROW_CLASS,
    formatRoomScore,
    RoomAvatar,
    RoomProgress,
    RoomStandings,
} from '@/features/quiz-room/components/RoomParts';
import { getRoomGoal } from '@/features/quiz-room/lib/room-awards';
import { fillRoomText, roomSettingsLine } from '@/features/quiz-room/lib/room-labels';
import type { RoomPhase } from '@/features/quiz-room/lib/room-schedule';
import type { RoomRevealDto, RoomStateDto } from '@/features/quiz-room/types';
import { formatPlural, getDictionary, type Locale } from '@/shared/i18n';
import { answerOptionClassName, answerVerdictClassName } from '@/shared/ui/answer-option';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
/** Сколько раз повторить ответ после сбоя сети, прежде чем просить нажать. */
const ANSWER_AUTO_RETRIES = 2;
const URGENT_SECONDS = 5;

/** Короткий отклик на телефоне; браузеры без вибрации просто молчат. */
function vibrate(pattern: number | number[]) {
    try {
        navigator.vibrate?.(pattern);
    } catch {
        // iOS / десктоп: API нет или запрещён — не важно.
    }
}

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Число набегает от 0 до `target` (при «меньше движения» — сразу). */
function useCountUp(target: number, durationMs = 700): number {
    const [value, setValue] = useState(0);

    useEffect(() => {
        if (prefersReducedMotion() || target === 0) {
            const id = requestAnimationFrame(() => setValue(target));
            return () => cancelAnimationFrame(id);
        }

        let frame = 0;
        const startedAt = performance.now();
        const tick = (time: number) => {
            const share = Math.min(1, (time - startedAt) / durationMs);
            // ease-out: быстро в начале, мягко в конце.
            setValue(Math.round(target * (1 - (1 - share) ** 3)));
            if (share < 1) frame = requestAnimationFrame(tick);
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [target, durationMs]);

    return value;
}

export function RoomCountdown({
    locale,
    state,
    endsAt,
    now,
}: {
    locale: Locale;
    state: RoomStateDto;
    endsAt: number;
    now: number;
}) {
    const dictionary = getDictionary(locale);
    const seconds = Math.max(1, Math.ceil((endsAt - now) / 1000));

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
            <p className={EYEBROW_CLASS}>{dictionary.room.starting}</p>
            <span
                key={seconds}
                className="flex size-44 items-center justify-center rounded-full border-8 border-surface-muted font-display text-8xl font-bold text-foreground tabular-nums motion-safe:animate-countdown-tick"
                aria-live="polite"
            >
                {seconds}
            </span>
            <p className="font-mono text-sm text-muted">
                {roomSettingsLine(dictionary, locale, state.settings)}
            </p>
        </div>
    );
}

type QuestionPhase = Extract<RoomPhase, { kind: 'intro' | 'answer' | 'reveal' }>;

type RoomQuestionProps = {
    locale: Locale;
    state: RoomStateDto;
    phase: QuestionPhase;
    now: number;
    refresh: () => void;
};

type AnswerPick = { position: number; key: string; failed: boolean };

export function RoomQuestion({ locale, state, phase, now, refresh }: RoomQuestionProps) {
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const total = state.schedule.length;
    const times = state.schedule[phase.position]!;
    const current = state.current?.position === phase.position ? state.current : null;
    const [pick, setPick] = useState<AnswerPick | null>(null);
    const myPick = pick?.position === phase.position ? pick : null;
    const myKey = current?.myAnswerKey ?? myPick?.key ?? null;
    const reveal = phase.kind === 'reveal' ? (current?.reveal ?? null) : null;
    const answeredCount = current?.answeredPlayerIds.length ?? 0;
    const answerMs = state.settings.answerSeconds * 1000;
    const isLast = phase.position === total - 1;
    const meId = state.me?.playerId ?? '';
    const streak = state.standings.find((row) => row.playerId === meId)?.streak ?? 0;

    async function send(key: string, position: number) {
        for (let attempt = 0; attempt <= ANSWER_AUTO_RETRIES; attempt += 1) {
            const result = await postRoom(`/api/room/${state.code}/answer`, { position, option: key });

            // TIME_UP / INVALID — повтор не поможет; остальное — сеть / Neon.
            if (result.ok || result.error === 'TIME_UP' || result.error === 'INVALID') {
                refresh();
                return;
            }
        }

        setPick({ position, key, failed: true });
    }

    function answer(key: string) {
        if (myKey || phase.kind !== 'answer') return;

        vibrate(12);
        setPick({ position: phase.position, key, failed: false });
        void send(key, phase.position);
    }

    function retry() {
        if (!myPick) return;
        setPick({ ...myPick, failed: false });
        void send(myPick.key, myPick.position);
    }

    const headerRight =
        phase.kind === 'reveal'
            ? isLast
                ? text.nextResults
                : fillRoomText(text.nextQuestion, { n: phase.position + 2 })
            : phase.kind === 'answer'
              ? fillRoomText(text.answered, { count: answeredCount, total: state.players.length })
              : null;

    return (
        <div
            className="flex flex-col gap-3"
            data-testid="room-question"
            data-phase={phase.kind}
            data-position={phase.position}
        >
            <div className="flex items-center justify-between gap-3">
                <p className={EYEBROW_CLASS}>
                    {fillRoomText(text.questionOf, { n: phase.position + 1, total })}
                </p>
                <div className="flex items-center gap-2">
                    {streak >= 2 && phase.kind !== 'reveal' ? (
                        <span className="rounded-full bg-warning-muted px-2 py-0.5 font-mono text-2xs text-warning">
                            {fillRoomText(text.streakBadge, { n: streak })}
                        </span>
                    ) : null}
                    {headerRight ? (
                        <p className="font-mono text-xs text-muted tabular-nums">{headerRight}</p>
                    ) : null}
                </div>
            </div>
            <RoomProgress total={total} marks={state.myMarks} current={phase.position} />

            {reveal ? <RevealVerdict locale={locale} state={state} reveal={reveal} /> : null}

            {current?.imageUrl && !reveal ? (
                <QuestionImage
                    src={current.imageUrl}
                    alt={current.text}
                    unavailableLabel={dictionary.quiz.imageUnavailable}
                    priority
                    expandHint={dictionary.quiz.imageExpandHint}
                    expandLabel={dictionary.quiz.imageExpandLabel}
                    closeLabel={dictionary.quiz.imageCloseLabel}
                />
            ) : null}

            <div className="flex items-center gap-3">
                {current ? (
                    <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug text-foreground">
                        {current.text}
                    </h2>
                ) : (
                    <div className="h-14 flex-1 animate-pulse rounded-md bg-surface-muted" aria-hidden />
                )}
                {phase.kind !== 'reveal' ? (
                    <TimerRing
                        reading={phase.kind === 'intro'}
                        readingLabel={text.reading}
                        remainingMs={phase.endsAt - now}
                        totalMs={phase.kind === 'intro' ? times.openAt - times.introAt : answerMs}
                    />
                ) : null}
            </div>

            <ul className="flex flex-col gap-2">
                {current?.options
                    ? current.options.map((option, index) => {
                          const tone = reveal
                              ? option.key === reveal.correctKey
                                  ? 'correct'
                                  : option.key === reveal.myKey
                                    ? 'wrong'
                                    : 'dimmed'
                              : myKey
                                ? option.key === myKey
                                    ? 'pending'
                                    : 'dimmed'
                                : 'idle';
                          const count = reveal?.counts[option.key] ?? 0;
                          const share = state.players.length ? count / state.players.length : 0;
                          const letterTone =
                              tone === 'correct'
                                  ? 'bg-success text-surface'
                                  : tone === 'wrong'
                                    ? 'bg-danger text-surface'
                                    : tone === 'pending'
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-surface-muted text-muted';

                          return (
                              <li key={option.key}>
                                  <button
                                      type="button"
                                      onClick={() => answer(option.key)}
                                      disabled={phase.kind !== 'answer' || Boolean(myKey)}
                                      aria-pressed={option.key === myKey}
                                      className={`${answerOptionClassName(tone, Boolean(myKey) || phase.kind !== 'answer')} relative gap-3 overflow-hidden motion-safe:transition-transform motion-safe:active:scale-[0.98]`}
                                      data-testid="room-option"
                                  >
                                      {reveal ? (
                                          <span
                                              aria-hidden
                                              className={`absolute inset-y-0 left-0 motion-safe:transition-[width] motion-safe:duration-700 ${
                                                  tone === 'correct' ? 'bg-success/20' : 'bg-muted/15'
                                              }`}
                                              style={{ width: `${share * 100}%` }}
                                          />
                                      ) : null}
                                      <span
                                          aria-hidden
                                          className={`relative flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-xs font-semibold ${letterTone}`}
                                      >
                                          {tone === 'correct' ? '✓' : tone === 'wrong' ? '✗' : OPTION_LETTERS[index]}
                                      </span>
                                      <span className="relative flex-1">{option.text}</span>
                                      {reveal ? (
                                          <span className="relative font-mono text-xs text-muted tabular-nums">
                                              {count}
                                          </span>
                                      ) : null}
                                  </button>
                              </li>
                          );
                      })
                    : Array.from({ length: 4 }, (_, index) => (
                          <li
                              key={index}
                              aria-hidden
                              className="flex min-h-14 items-center gap-3 rounded-lg border-2 border-dashed border-border px-4 opacity-60"
                          >
                              <span className="flex size-7 items-center justify-center rounded-md bg-surface-muted font-mono text-xs text-muted">
                                  {OPTION_LETTERS[index]}
                              </span>
                          </li>
                      ))}
            </ul>

            {phase.kind === 'answer' ? (
                <div className="flex flex-col items-center gap-2 pt-1">
                    <AnsweredAvatars state={state} answeredIds={current?.answeredPlayerIds ?? []} />
                    {myPick?.failed ? (
                        <button
                            type="button"
                            onClick={retry}
                            className="min-h-11 cursor-pointer text-sm font-medium text-danger underline underline-offset-2"
                        >
                            {text.answerFailed}
                        </button>
                    ) : myKey ? (
                        <p className="text-sm text-muted" role="status">
                            {text.answerAccepted}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {phase.kind === 'reveal' ? (
                <>
                    <GoalBanner locale={locale} state={state} />
                    <section className="rounded-lg border border-border bg-surface p-3 shadow-sm">
                        <h3 className={`${EYEBROW_CLASS} mb-1 px-2`}>{text.leaderboard}</h3>
                        <MovingStandings state={state} />
                    </section>
                </>
            ) : null}
        </div>
    );
}

/** Таймер-кольцо: убывает по кругу; последние секунды — красное и пульсирует. */
function TimerRing({
    reading,
    readingLabel,
    remainingMs,
    totalMs,
}: {
    reading: boolean;
    readingLabel: string;
    remainingMs: number;
    totalMs: number;
}) {
    const share = Math.max(0, Math.min(1, remainingMs / Math.max(totalMs, 1)));
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const urgent = !reading && seconds <= URGENT_SECONDS;
    const radius = 24;
    const circumference = 2 * Math.PI * radius;

    return (
        <div
            className={`relative flex size-14 shrink-0 items-center justify-center ${urgent ? 'motion-safe:animate-timer-pulse' : ''}`}
            role="timer"
            aria-label={reading ? readingLabel : String(seconds)}
        >
            <svg viewBox="0 0 56 56" className="absolute inset-0 size-14 -rotate-90" aria-hidden>
                <circle cx="28" cy="28" r={radius} fill="none" strokeWidth="5" className="stroke-surface-muted" />
                <circle
                    cx="28"
                    cy="28"
                    r={radius}
                    fill="none"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - share)}
                    className={reading ? 'stroke-muted' : urgent ? 'stroke-danger' : 'stroke-primary'}
                />
            </svg>
            {reading ? (
                <span className="relative font-mono text-2xs text-muted">{readingLabel}</span>
            ) : (
                <span
                    className={`relative font-display text-xl font-bold tabular-nums ${urgent ? 'text-danger' : 'text-foreground'}`}
                >
                    {seconds}
                </span>
            )}
        </div>
    );
}

function AnsweredAvatars({ state, answeredIds }: { state: RoomStateDto; answeredIds: string[] }) {
    const answered = new Set(answeredIds);

    return (
        <ul className="flex flex-wrap justify-center gap-1.5" aria-hidden>
            {state.players.map((player) => (
                <li
                    key={player.id}
                    className={`relative rounded-full motion-safe:transition-opacity ${answered.has(player.id) ? '' : 'opacity-40'}`}
                >
                    <RoomAvatar player={player} />
                    {answered.has(player.id) ? (
                        <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full border-2 border-background bg-success text-[8px] font-bold text-surface motion-safe:animate-room-pop">
                            ✓
                        </span>
                    ) : null}
                </li>
            ))}
        </ul>
    );
}

function RevealVerdict({
    locale,
    state,
    reveal,
}: {
    locale: Locale;
    state: RoomStateDto;
    reveal: RoomRevealDto;
}) {
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const isCorrect = reveal.myKey !== null && reveal.myKey === reveal.correctKey;
    const verdict = answerVerdictClassName(isCorrect);
    const points = useCountUp(isCorrect ? reveal.myPoints : 0);
    const correctText =
        state.current?.options?.find((option) => option.key === reveal.correctKey)?.text ?? '';
    const me = state.standings.find((row) => row.playerId === state.me?.playerId);
    const isFastest = isCorrect && reveal.fastestPlayerId === state.me?.playerId;
    const notes = [
        me && me.streak >= 2 ? fillRoomText(text.streakBadge, { n: me.streak }) : null,
        isFastest ? text.fastest : null,
    ].filter(Boolean);

    useEffect(() => {
        vibrate(isCorrect ? 30 : [20, 60, 20]);
    }, [isCorrect]);

    return (
        <div className={`${verdict.plate} flex items-center justify-between gap-3`} role="status">
            <div className="min-w-0">
                <p className={verdict.title}>
                    {isCorrect
                        ? dictionary.quiz.answer.correct
                        : reveal.myKey
                          ? dictionary.quiz.answer.wrong
                          : text.missed}
                </p>
                <p className={`mt-0.5 text-sm ${isCorrect ? 'font-mono text-success' : 'text-foreground'}`}>
                    {isCorrect ? notes.join(' · ') : fillRoomText(text.correctAnswer, { answer: correctText })}
                </p>
            </div>
            {isCorrect ? (
                <span className="font-display text-3xl font-bold text-success tabular-nums">
                    +{formatRoomScore(points)}
                </span>
            ) : null}
        </div>
    );
}

/** «Ты 2-й · до 1-го места 170 очков» / «Ты лидер · отрыв 340 очков». */
function GoalBanner({ locale, state }: { locale: Locale; state: RoomStateDto }) {
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const goal = getRoomGoal(state.standings, state.me?.playerId ?? '');

    if (!goal) return null;

    const me = state.standings.find((row) => row.playerId === state.me?.playerId);
    const label =
        goal.kind === 'lead'
            ? text.leadBy
            : fillRoomText(text.gapToNext, { place: me?.rank ?? '', target: goal.targetRank });
    const value = formatPlural(locale, goal.kind === 'lead' ? goal.ahead : goal.behind, text.points);

    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/35 bg-primary/10 px-3 py-2 text-sm text-foreground">
            <span>{label}</span>
            <span className="font-mono font-semibold tabular-nums">{value}</span>
        </div>
    );
}

/**
 * Таблица, которая переезжает: первые ~0,7 с — порядок до вопроса, потом
 * строки плавно едут на новые места (как в Kahoot). При «меньше движения»
 * — сразу новый порядок.
 */
function MovingStandings({ state }: { state: RoomStateDto }) {
    const [settled, setSettled] = useState(false);
    const rowHeight = 48;

    useEffect(() => {
        const id = setTimeout(() => setSettled(true), prefersReducedMotion() ? 0 : 700);
        return () => clearTimeout(id);
    }, []);

    const order = [...state.standings].sort((left, right) =>
        settled
            ? left.rank - right.rank
            : (left.previousRank ?? left.rank) - (right.previousRank ?? right.rank),
    );
    const slotOf = new Map(order.map((row, index) => [row.playerId, index]));

    return (
        <div className="relative" style={{ height: state.standings.length * rowHeight }} data-testid="room-standings">
            {state.standings.map((row) => (
                <div
                    key={row.playerId}
                    className="absolute inset-x-0 motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-gm-out"
                    style={{ transform: `translateY(${(slotOf.get(row.playerId) ?? 0) * rowHeight}px)` }}
                >
                    <RoomStandings standings={[row]} players={state.players} showGain />
                </div>
            ))}
        </div>
    );
}
