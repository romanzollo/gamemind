'use client';

/**
 * Countdown Timed mode.
 *
 * Показывает оставшееся время; при переходе на 00:00 один раз зовёт
 * `onExpired` (родитель делает auto-submit — как Kahoot/LMS).
 * Цифры только после mount — иначе hydration mismatch (SSR vs Date.now()).
 * Авторитет дедлайна всё равно сервер (`timedEndsAt` + grace).
 * Canon: docs/DECISIONS.md → Timed Mode MVP.
 */

import { useEffect, useRef, useState } from 'react';

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
    const [mounted, setMounted] = useState(false);
    const [remainingMs, setRemainingMs] = useState(0);
    const expiredNotifiedRef = useRef(false);
    const onExpiredRef = useRef(onExpired);
    onExpiredRef.current = onExpired;

    useEffect(() => {
        setMounted(true);

        const tick = () => {
            const next = getRemainingMs(timedEndsAt, Date.now());
            setRemainingMs(next);

            if (next <= 0 && !expiredNotifiedRef.current) {
                expiredNotifiedRef.current = true;
                onExpiredRef.current?.();
            }
        };

        tick();
        const intervalId = window.setInterval(tick, 250);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [timedEndsAt]);

    const expired = mounted && remainingMs <= 0;
    const display = mounted ? formatRemaining(remainingMs) : '--:--';

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
