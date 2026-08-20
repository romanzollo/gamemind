'use client';

/**
 * Countdown банка Survival.
 *
 * Remaining = max(0, T0 + 4×correct − 6×wrong − elapsed) от `startedAt`.
 * Не `timedEndsAt`. Grace на клиенте нет — 00:00 замирает UX; авторитет
 * часов на submit (`isSurvivalClockOk`) в Chat E.
 * Цифры только после mount — иначе hydration mismatch.
 * Canon: docs/DECISIONS.md → Survival Mode MVP.
 */

import { useEffect, useRef, useState } from 'react';

import { getSurvivalBankRemainingMs } from '@/features/survival-mode/lib/get-survival-bank-remaining-ms';

type SurvivalQuizBankCountdownProps = {
    startedAt: string;
    correctCount: number;
    wrongCount: number;
    initialBankSeconds: number;
    correctDeltaSeconds: number;
    wrongDeltaSeconds: number;
    remainingLabel: string;
    expiredLabel: string;
    /**
     * Все вопросы lock-in / идёт submit — заморозить цифры.
     * Иначе банк продолжает тикать после конца волны и путает.
     */
    frozen?: boolean;
    /** Один вызов при первом remaining = 0. */
    onExpired?: () => void;
};

function getRemainingMs(args: {
    startedAt: string;
    nowMs: number;
    correctCount: number;
    wrongCount: number;
    initialBankSeconds: number;
    correctDeltaSeconds: number;
    wrongDeltaSeconds: number;
}): number {
    const startedAtMs = new Date(args.startedAt).getTime();

    if (Number.isNaN(startedAtMs)) {
        return 0;
    }

    return getSurvivalBankRemainingMs({
        startedAtMs,
        nowMs: args.nowMs,
        correctCount: args.correctCount,
        wrongCount: args.wrongCount,
        initialBankSeconds: args.initialBankSeconds,
        correctDeltaSeconds: args.correctDeltaSeconds,
        wrongDeltaSeconds: args.wrongDeltaSeconds,
    });
}

function formatRemaining(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function SurvivalQuizBankCountdown({
    startedAt,
    correctCount,
    wrongCount,
    initialBankSeconds,
    correctDeltaSeconds,
    wrongDeltaSeconds,
    remainingLabel,
    expiredLabel,
    frozen = false,
    onExpired,
}: SurvivalQuizBankCountdownProps) {
    const [mounted, setMounted] = useState(false);
    const [remainingMs, setRemainingMs] = useState(0);
    const expiredNotifiedRef = useRef(false);
    const onExpiredRef = useRef(onExpired);
    onExpiredRef.current = onExpired;

    useEffect(() => {
        setMounted(true);
        expiredNotifiedRef.current = false;

        const readRemaining = () =>
            getRemainingMs({
                startedAt,
                nowMs: Date.now(),
                correctCount,
                wrongCount,
                initialBankSeconds,
                correctDeltaSeconds,
                wrongDeltaSeconds,
            });

        // Конец волны / submit: один снимок remaining, без interval.
        if (frozen) {
            setRemainingMs(readRemaining());
            return;
        }

        const tick = () => {
            const next = readRemaining();
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
    }, [
        startedAt,
        correctCount,
        wrongCount,
        initialBankSeconds,
        correctDeltaSeconds,
        wrongDeltaSeconds,
        frozen,
    ]);

    const expired = mounted && remainingMs <= 0 && !frozen;
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
                        : frozen
                          ? 'font-mono text-base font-semibold tabular-nums text-muted'
                          : 'font-mono text-base font-semibold tabular-nums text-foreground'
                }
                suppressHydrationWarning
            >
                {display}
            </span>
        </div>
    );
}
