'use client';

/**
 * Countdown Timed mode.
 *
 * Показывает оставшееся время; при переходе на 00:00 один раз зовёт
 * `onExpired` (родитель делает auto-submit — как Kahoot/LMS).
 * Цифры только после гидрации — иначе hydration mismatch (SSR vs Date.now()).
 * Remaining выводится из `nowMs` в render; interval только двигает часы.
 * «Сейчас» — по часам сервера (server-clock): спешащие часы устройства
 * обрывали партию раньше дедлайна. Пока идёт замер (доли секунды) —
 * часы устройства. Авторитет дедлайна всё равно сервер (`timedEndsAt` + grace).
 * AUDIO_GUESS: `listening(now)` — пауза на музыку (окно прослушивания).
 * Дедлайн на экране = `timedEndsAt` + засчитанные паузы; пока окно идёт,
 * цифры стоят и видна отметка «Пауза на музыку». Формула та же, что у
 * пересчёта на сервере (`listening-window.ts`).
 * Canon: docs/DECISIONS.md → Timed Mode MVP; Audio questions: AUDIO_GUESS.
 */

import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { ListeningPause } from '@/features/quiz/components/ListeningPause';
import { serverNow, useServerClockReady } from '@/shared/ui/server-clock';
import { useHydrated } from '@/shared/ui/use-hydrated';

type TimedQuizCountdownProps = {
    /**
     * ISO UTC дедлайна без пауз на музыку. Без аудио = `QuizSession.timedEndsAt`;
     * с аудио — потолок минус окно × число аудиовопросов.
     */
    timedEndsAt: string;
    /** Пауза на музыку сейчас: прибавка к дедлайну и идёт ли окно. */
    listening?: (nowMs: number) => {
        creditMs: number;
        active: boolean;
        remainingMs: number;
    };
    pausedLabel?: string;
    remainingLabel: string;
    expiredLabel: string;
    /** Один вызов при первом достижении 00:00 (auto-submit). */
    onExpired?: () => void;
};

function getRemainingMs(
    timedEndsAt: string,
    nowMs: number,
    creditMs = 0,
): number {
    const endsAtMs = new Date(timedEndsAt).getTime();

    if (Number.isNaN(endsAtMs)) {
        return 0;
    }

    return Math.max(0, endsAtMs + creditMs - nowMs);
}

const NO_PAUSE = { creditMs: 0, active: false, remainingMs: 0 };

function formatRemaining(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function TimedQuizCountdown({
    timedEndsAt,
    remainingLabel,
    expiredLabel,
    onExpired,
    listening,
    pausedLabel,
}: TimedQuizCountdownProps) {
    const hydrated = useHydrated();
    // Запускает замер поправки часов; тики ниже читают serverNow().
    useServerClockReady();
    const [nowMs, setNowMs] = useState(() => serverNow());
    const expiredNotifiedRef = useRef(false);
    // Свежий onExpired без перезапуска interval при каждом render родителя.
    const notifyExpired = useEffectEvent(() => {
        onExpired?.();
    });
    const readCredit = useEffectEvent(
        (now: number) => listening?.(now).creditMs ?? 0,
    );

    useEffect(() => {
        // Первый tick через 250 мс: initial nowMs уже взят в render,
        // уже истёкшая сессия получит onExpired на первом tick.
        const tick = () => {
            const now = serverNow();
            setNowMs(now);

            if (
                getRemainingMs(timedEndsAt, now, readCredit(now)) <= 0 &&
                !expiredNotifiedRef.current
            ) {
                expiredNotifiedRef.current = true;
                notifyExpired();
            }
        };

        const intervalId = window.setInterval(tick, 250);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [timedEndsAt]);

    const pause = listening?.(nowMs) ?? NO_PAUSE;
    const remainingMs = getRemainingMs(timedEndsAt, nowMs, pause.creditMs);
    const expired = hydrated && remainingMs <= 0;
    const display = hydrated ? formatRemaining(remainingMs) : '--:--';
    const paused = hydrated && pause.active && !expired;

    return (
        <div>
            <div
                className="flex items-center justify-between gap-3 text-sm"
                aria-live="polite"
            >
                <span
                    className={
                        expired
                            ? 'font-medium text-danger'
                            : 'font-medium text-foreground'
                    }
                >
                    {expired ? expiredLabel : remainingLabel}
                </span>
                <span
                    className={
                        expired
                            ? 'font-mono text-base font-semibold tabular-nums text-danger'
                            : 'font-mono text-base font-semibold tabular-nums text-foreground'
                    }
                    suppressHydrationWarning
                >
                    {display}
                </span>
            </div>
            {paused && pausedLabel ? (
                <ListeningPause
                    label={pausedLabel}
                    remainingMs={pause.remainingMs}
                />
            ) : null}
        </div>
    );
}
