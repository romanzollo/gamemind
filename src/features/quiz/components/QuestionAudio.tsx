'use client';

/**
 * Плеер клипа AUDIO_GUESS: круглая кнопка, волна как у голосовых,
 * «0:03 / 0:10», повтор после конца клипа.
 *
 * - Клип уже скачан (`useQuizAudioClips`) и играет через общий `<audio>`
 *   партии (`QuizAudioController`) — так работает автозапуск на iOS.
 * - `autoPlay`: в игре клип стартует сам при показе вопроса; если браузер
 *   не дал — подсказка «Нажми, чтобы послушать». В разборе — только по тапу.
 * - Смена вопроса / уход со страницы останавливает клип.
 * - `variant="review"`: компактнее; нет клипа → «Клип недоступен» без
 *   кнопки повтора (в разборе это не ошибка игрока).
 *
 * Анимации — только `motion-safe:`. Цвет — токенами (DESIGN.md).
 * ADR: docs/DECISIONS.md → Audio questions: AUDIO_GUESS.
 */

import { useEffect, useRef, useState } from 'react';

import {
    type QuizAudioClip,
    type QuizAudioController,
    useQuizAudioPlayback,
} from '@/features/quiz/components/use-quiz-audio';
import {
    QUIZ_AUDIO_WAVEFORM_BARS,
    formatClipTime,
    placeholderWaveform,
} from '@/features/quiz/lib/quiz-audio-waveform';
import { QuestionAudioVolume } from '@/features/quiz/components/QuestionAudioVolume';
import type { Dictionary } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';

type QuestionAudioProps = {
    clip: QuizAudioClip;
    controller: QuizAudioController;
    labels: Dictionary['quiz']['audio'];
    /** Запустить клип, как только он готов (игра). */
    autoPlay?: boolean;
    onReload?: () => void;
    variant?: 'play' | 'review';
};

const PLACEHOLDER = placeholderWaveform(QUIZ_AUDIO_WAVEFORM_BARS);

function PlayIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden className="ml-0.5 size-6 fill-current">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
        </svg>
    );
}

function PauseIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden className="size-6 fill-current">
            <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
            <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
        </svg>
    );
}

function ReplayIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-4 fill-none stroke-current"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 12a8 8 0 1 0 2.4-5.7" />
            <path d="M4 4v4.5h4.5" />
        </svg>
    );
}

export function QuestionAudio({
    clip,
    controller,
    labels,
    autoPlay = false,
    onReload,
    variant = 'play',
}: QuestionAudioProps) {
    const playback = useQuizAudioPlayback(controller);
    const ready = clip.status === 'ready' ? clip : null;
    const src = ready?.objectUrl ?? null;
    const isMine = src !== null && playback.src === src;
    const playing = isMine && playback.playing;
    const ended = isMine && playback.ended;

    const [progressSeconds, setProgressSeconds] = useState(0);
    const [needsTap, setNeedsTap] = useState(false);
    const autoPlayedRef = useRef<string | null>(null);

    // Автозапуск один раз на клип; отказ браузера → подсказка про тап.
    // Прерванный запуск (`aborted`: уход с вопроса, двойной эффект React в
    // dev) не засчитываем — при следующем запуске эффекта попробуем снова.
    useEffect(() => {
        if (!autoPlay || !src || autoPlayedRef.current === src) return;
        let cancelled = false;
        void controller.play(src).then((result) => {
            if (cancelled || result === 'aborted') return;
            autoPlayedRef.current = src;
            setNeedsTap(result !== 'playing');
        });
        return () => {
            cancelled = true;
        };
    }, [autoPlay, controller, src]);

    // Уход с вопроса — тишина.
    useEffect(() => {
        if (!src) return;
        return () => controller.stop(src);
    }, [controller, src]);

    // Прогресс волны: кадр анимации, пока клип играет.
    useEffect(() => {
        if (!playing) return;
        let frame = 0;
        const tick = () => {
            setProgressSeconds(controller.currentTime());
            frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [controller, playing]);

    const durationSeconds = ready?.durationSeconds || controller.duration() || 0;
    const shownSeconds = ended ? durationSeconds : isMine ? progressSeconds : 0;
    const progress = durationSeconds > 0 ? Math.min(1, shownSeconds / durationSeconds) : 0;
    const peaks = ready?.peaks ?? PLACEHOLDER;
    const compact = variant === 'review';

    const toggle = () => {
        if (!src) return;
        if (playing) {
            controller.pause();
            return;
        }
        setNeedsTap(false);
        void controller.play(src, { restart: ended }).then((result) => {
            if (result !== 'aborted') setNeedsTap(result === 'blocked');
        });
    };

    if (clip.status === 'error' && compact) {
        return (
            <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-muted">
                {labels.unavailable}
            </p>
        );
    }

    return (
        <section
            aria-label={labels.regionLabel}
            data-testid="quiz-audio"
            data-status={clip.status}
            className={[
                'rounded-lg border border-border bg-surface shadow-sm',
                compact ? 'p-2.5' : 'p-3 sm:p-4',
            ].join(' ')}
        >
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    data-testid="quiz-audio-toggle"
                    onClick={toggle}
                    disabled={!ready}
                    aria-label={playing ? labels.pause : labels.play}
                    className={[
                        'flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm',
                        'hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        'motion-safe:transition-colors',
                        compact ? 'size-11' : 'size-14',
                    ].join(' ')}
                >
                    {playing ? <PauseIcon /> : <PlayIcon />}
                </button>

                <div className="min-w-0 flex-1">
                    <div
                        aria-hidden
                        className={[
                            'flex items-center gap-[2px]',
                            compact ? 'h-8' : 'h-10',
                            clip.status === 'loading' ? 'motion-safe:animate-pulse' : '',
                        ].join(' ')}
                    >
                        {peaks.map((peak, index) => {
                            const played = (index + 0.5) / peaks.length <= progress;
                            return (
                                <span
                                    key={index}
                                    className={[
                                        'flex-1 rounded-full',
                                        played ? 'bg-primary' : 'bg-border',
                                    ].join(' ')}
                                    style={{ height: `${Math.round(peak * 100)}%` }}
                                />
                            );
                        })}
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-2xs tabular-nums text-muted">
                        <span>{formatClipTime(shownSeconds)}</span>
                        <span>{durationSeconds > 0 ? formatClipTime(durationSeconds) : '–:––'}</span>
                    </div>
                </div>

                <QuestionAudioVolume labels={labels} />
            </div>

            {clip.status === 'loading' ? (
                <p className="mt-2 text-sm text-muted" role="status">
                    {labels.loading}
                </p>
            ) : null}

            {clip.status === 'error' ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                    <p className="flex-1 text-sm text-danger" role="alert">
                        {labels.loadFailed}
                    </p>
                    {onReload ? (
                        <button
                            type="button"
                            onClick={onReload}
                            className={buttonClassName({
                                variant: 'secondary',
                                className: 'min-h-11 px-4',
                            })}
                        >
                            {labels.reload}
                        </button>
                    ) : null}
                </div>
            ) : null}

            {ready && needsTap && !playing && !ended ? (
                <p className="mt-2 text-sm text-muted">{labels.tapToPlay}</p>
            ) : null}

            {ended ? (
                <button
                    type="button"
                    data-testid="quiz-audio-replay"
                    onClick={toggle}
                    className={buttonClassName({
                        variant: 'secondary',
                        className: 'mt-2 min-h-11 gap-2 px-4',
                    })}
                >
                    <ReplayIcon />
                    {labels.replay}
                </button>
            ) : null}
        </section>
    );
}
