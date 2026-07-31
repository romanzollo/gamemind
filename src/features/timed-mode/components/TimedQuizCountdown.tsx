'use client';

/**
 * Countdown Timed mode — только UX.
 *
 * Авторитет дедлайна — серверный `timedEndsAt` (ISO). Этот компонент
 * лишь показывает оставшееся время; не блокирует submit и не меняет score.
 * Submit-gate `TIMED_OUT` — следующий урок.
 * Canon: docs/DECISIONS.md → Timed Mode MVP.
 */

import { useEffect, useState } from 'react';

type TimedQuizCountdownProps = {
    /** ISO UTC с сервера (QuizSession.timedEndsAt). */
    timedEndsAt: string;
    remainingLabel: string;
    expiredLabel: string;
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
}: TimedQuizCountdownProps) {
    const [remainingMs, setRemainingMs] = useState(() =>
        getRemainingMs(timedEndsAt, Date.now()),
    );

    useEffect(() => {
        const tick = () => {
            setRemainingMs(getRemainingMs(timedEndsAt, Date.now()));
        };

        tick();
        const intervalId = window.setInterval(tick, 250);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [timedEndsAt]);

    const expired = remainingMs <= 0;

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
            >
                {formatRemaining(remainingMs)}
            </span>
        </div>
    );
}
