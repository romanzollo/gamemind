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
 * Canon: docs/DECISIONS.md → Timed Mode MVP.
 */

import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { serverNow, useServerClockReady } from '@/shared/ui/server-clock';
import { useHydrated } from '@/shared/ui/use-hydrated';

type TimedQuizCountdownProps = {
    /** ISO UTC с сервера (QuizSession.timedEndsAt). */
    timedEndsAt: string;
    remainingLabel: string;
    expiredLabel: string;
    /** Один вызов при первом достижении 00:00 (auto-submit). */
    onExpired?: () => void;
};

function getRemainingMs(timedEndsAt: string, nowMs: number): number {
    const endsAtMs = new Date(timedEndsAt).getTime();

    if (Number.isNaN(endsAtMs)) {
        return 0;
    }

    return Math.max(0, endsAtMs - nowMs);
}

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

    useEffect(() => {
        // Первый tick через 250 мс: initial nowMs уже взят в render,
        // уже истёкшая сессия получит onExpired на первом tick.
        const tick = () => {
            const now = serverNow();
            setNowMs(now);

            if (
                getRemainingMs(timedEndsAt, now) <= 0 &&
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

    const remainingMs = getRemainingMs(timedEndsAt, nowMs);
    const expired = hydrated && remainingMs <= 0;
    const display = hydrated ? formatRemaining(remainingMs) : '--:--';

    return (
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
    );
}
