'use client';

/**
 * Игра в комнате (экраны 5–8 макета): отсчёт, показ вопроса, ответы с
 * таймером и разбор с таблицей. Фаза — из расписания по серверным часам;
 * данные фазы (текст, варианты, верный ответ) приносит опрос. Пока опрос
 * не принёс данные новой фазы — вопрос показывается без вариантов.
 *
 * Ответ: касание → вариант подсвечен, запрос на сервер; верный ответ
 * никто не видит до конца приёма (его присылает разбор).
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { useState } from 'react';

import { QuestionImage } from '@/features/quiz/components/QuestionImage';
import { postRoom } from '@/features/quiz-room/components/use-room-state';
import {
    EYEBROW_CLASS,
    formatRoomScore,
    RoomAvatar,
    RoomProgress,
    RoomStandings,
} from '@/features/quiz-room/components/RoomParts';
import { fillRoomText, roomSettingsLine } from '@/features/quiz-room/lib/room-labels';
import type { RoomPhase } from '@/features/quiz-room/lib/room-schedule';
import type { RoomStateDto } from '@/features/quiz-room/types';
import { getDictionary, type Locale } from '@/shared/i18n';
import { answerOptionClassName, answerVerdictClassName } from '@/shared/ui/answer-option';

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

export function RoomQuestion({ locale, state, phase, now, refresh }: RoomQuestionProps) {
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const total = state.schedule.length;
    const times = state.schedule[phase.position]!;
    const current = state.current?.position === phase.position ? state.current : null;
    const [pick, setPick] = useState<{ position: number; key: string; failed: boolean } | null>(
        null,
    );
    const myPick = pick?.position === phase.position ? pick : null;
    const myKey = current?.myAnswerKey ?? myPick?.key ?? null;
    const reveal = phase.kind === 'reveal' ? current?.reveal ?? null : null;
    const answeredCount = current?.answeredPlayerIds.length ?? 0;
    const answerMs = state.settings.answerSeconds * 1000;
    const isLast = phase.position === total - 1;

    async function answer(key: string) {
        if (myKey || phase.kind !== 'answer') return;

        setPick({ position: phase.position, key, failed: false });

        const result = await postRoom(`/api/room/${state.code}/answer`, {
            position: phase.position,
            option: key,
        });

        if (!result.ok && result.error !== 'TIME_UP') {
            setPick({ position: phase.position, key, failed: true });
            return;
        }

        refresh();
    }

    async function retry() {
        if (!myPick) return;
        setPick(null);
        await answer(myPick.key);
    }

    const headerRight =
        phase.kind === 'reveal'
            ? isLast
                ? text.nextResults
                : fillRoomText(text.nextQuestion, { n: phase.position + 2 })
            : phase.kind === 'answer'
              ? fillRoomText(text.answered, { count: answeredCount, total: state.players.length })
              : state.code;

    return (
        <div className="flex flex-col gap-3" data-testid="room-question" data-phase={phase.kind} data-position={phase.position}>
            <div className="flex items-center justify-between gap-3">
                <p className={EYEBROW_CLASS}>
                    {fillRoomText(text.questionOf, { n: phase.position + 1, total })}
                </p>
                <p className="font-mono text-xs text-muted tabular-nums">{headerRight}</p>
            </div>
            <RoomProgress total={total} marks={state.myMarks} current={phase.position} />

            {reveal ? (
                <RevealVerdict locale={locale} state={state} myKey={reveal.myKey} reveal={reveal} />
            ) : null}

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

            {current ? (
                <h2 className="text-lg font-semibold leading-snug text-foreground">{current.text}</h2>
            ) : (
                <div className="h-14 animate-pulse rounded-md bg-surface-muted" aria-hidden />
            )}

            {phase.kind !== 'reveal' ? (
                <PhaseTimer
                    label={phase.kind === 'intro' ? text.reading : null}
                    remainingMs={phase.endsAt - now}
                    totalMs={phase.kind === 'intro' ? times.openAt - times.introAt : answerMs}
                />
            ) : null}

            <ul className="flex flex-col gap-2">
                {current?.options
                    ? current.options.map((option) => {
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

                          return (
                              <li key={option.key}>
                                  <button
                                      type="button"
                                      onClick={() => answer(option.key)}
                                      disabled={phase.kind !== 'answer' || Boolean(myKey)}
                                      aria-pressed={option.key === myKey}
                                      className={`${answerOptionClassName(tone, Boolean(myKey) || phase.kind !== 'answer')} gap-3`}
                                      data-testid="room-option"
                                  >
                                      {tone === 'correct' ? (
                                          <span aria-hidden className="font-bold text-success">✓</span>
                                      ) : tone === 'wrong' ? (
                                          <span aria-hidden className="font-bold text-danger">✗</span>
                                      ) : null}
                                      <span className="flex-1">{option.text}</span>
                                      {reveal ? (
                                          <span className="font-mono text-xs text-muted tabular-nums">
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
                              className="min-h-14 rounded-lg border-2 border-dashed border-border opacity-60"
                          />
                      ))}
            </ul>

            {phase.kind === 'answer' ? (
                <div className="flex flex-col items-center gap-2 pt-1">
                    <AnsweredAvatars state={state} answeredIds={current?.answeredPlayerIds ?? []} />
                    {myPick?.failed ? (
                        <button
                            type="button"
                            onClick={retry}
                            className="cursor-pointer text-sm font-medium text-danger underline underline-offset-2"
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
                <section className="rounded-lg border border-border bg-surface p-3 shadow-sm">
                    <h3 className={`${EYEBROW_CLASS} mb-1 px-2`}>{text.leaderboard}</h3>
                    <RoomStandings standings={state.standings} players={state.players} showGain limit={5} />
                </section>
            ) : null}
        </div>
    );
}

function PhaseTimer({
    label,
    remainingMs,
    totalMs,
}: {
    label: string | null;
    remainingMs: number;
    totalMs: number;
}) {
    const share = Math.max(0, Math.min(1, remainingMs / Math.max(totalMs, 1)));
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const urgent = !label && seconds <= 5;

    return (
        <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                <div
                    className={`h-full rounded-full ${label ? 'bg-muted' : urgent ? 'bg-danger' : 'bg-primary'}`}
                    style={{ width: `${share * 100}%` }}
                />
            </div>
            {label ? (
                <span className="font-mono text-xs text-muted">{label}</span>
            ) : (
                <span
                    className={`min-w-8 text-right font-display text-2xl font-semibold tabular-nums ${urgent ? 'text-danger' : 'text-foreground'}`}
                    aria-live="off"
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
                    className={`relative rounded-full ${answered.has(player.id) ? '' : 'opacity-40'}`}
                >
                    <RoomAvatar player={player} />
                    {answered.has(player.id) ? (
                        <span className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center rounded-full border-2 border-background bg-success text-[8px] font-bold text-surface">
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
    myKey,
    reveal,
}: {
    locale: Locale;
    state: RoomStateDto;
    myKey: string | null;
    reveal: NonNullable<NonNullable<RoomStateDto['current']>['reveal']>;
}) {
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const isCorrect = myKey !== null && myKey === reveal.correctKey;
    const verdict = answerVerdictClassName(isCorrect);
    const correctText =
        state.current?.options?.find((option) => option.key === reveal.correctKey)?.text ?? '';
    const me = state.standings.find((row) =>
        state.players.some((player) => player.isMe && player.id === row.playerId),
    );

    return (
        <div className={`${verdict.plate} flex items-center justify-between gap-3`} role="status">
            <div className="min-w-0">
                <p className={verdict.title}>
                    {isCorrect
                        ? dictionary.quiz.answer.correct
                        : myKey
                          ? dictionary.quiz.answer.wrong
                          : text.missed}
                </p>
                <p className="mt-0.5 text-sm text-foreground">
                    {isCorrect
                        ? me && me.streak >= 2
                            ? fillRoomText(text.streak, { n: me.streak })
                            : null
                        : fillRoomText(text.correctAnswer, { answer: correctText })}
                </p>
            </div>
            {isCorrect ? (
                <span className="font-display text-3xl font-bold text-success tabular-nums">
                    +{formatRoomScore(reveal.myPoints)}
                </span>
            ) : null}
        </div>
    );
}
