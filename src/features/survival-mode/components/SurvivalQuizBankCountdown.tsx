/**
 * Countdown банка Survival.
 *
 * Remaining = max(0, T0 + 4×correct − 6×wrong − elapsed) от `startedAt`.
 * Не `timedEndsAt`. Grace на клиенте нет — 00:00 замирает UX; авторитет
 * часов на submit (`isSurvivalClockOk`).
 * Цифры только после гидрации — иначе hydration mismatch.
 * Remaining выводится в render из `nowMs` + текущих correct/wrong:
 * штраф/бонус виден сразу на lock-in, interval только двигает часы.
 * AUDIO_GUESS: `listening(now)` — пауза на музыку; банк стоит, пока идёт
 * окно прослушивания, и видна отметка «Пауза на музыку».
 * Canon: docs/DECISIONS.md → Survival Mode MVP; Audio questions: AUDIO_GUESS.
 */

import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { ListeningPause } from '@/features/quiz/components/ListeningPause';
import { getSurvivalBankRemainingMs } from '@/features/survival-mode/lib/get-survival-bank-remaining-ms';
import { serverNow } from '@/shared/ui/server-clock';
import { useHydrated } from '@/shared/ui/use-hydrated';

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
    /** Пауза на музыку сейчас: прибавка к банку и идёт ли окно. */
    listening?: (nowMs: number) => {
        creditMs: number;
        active: boolean;
        remainingMs: number;
    };
    pausedLabel?: string;
};

const NO_PAUSE = { creditMs: 0, active: false, remainingMs: 0 };

function getRemainingMs(args: {
    startedAt: string;
    nowMs: number;
    correctCount: number;
    wrongCount: number;
    initialBankSeconds: number;
    correctDeltaSeconds: number;
    wrongDeltaSeconds: number;
    creditMs: number;
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
        creditMs: args.creditMs,
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
    listening,
    pausedLabel,
}: SurvivalQuizBankCountdownProps) {
    const hydrated = useHydrated();
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
        expiredNotifiedRef.current = false;

        // Конец волны / submit: часы стоят на последнем tick, без interval.
        if (frozen) {
            return;
        }

        const tick = () => {
            const now = serverNow();
            setNowMs(now);

            const next = getRemainingMs({
                startedAt,
                nowMs: now,
                correctCount,
                wrongCount,
                initialBankSeconds,
                correctDeltaSeconds,
                wrongDeltaSeconds,
                creditMs: readCredit(now),
            });

            if (next <= 0 && !expiredNotifiedRef.current) {
                expiredNotifiedRef.current = true;
                notifyExpired();
            }
        };

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

    const pause = listening?.(nowMs) ?? NO_PAUSE;
    const remainingMs = getRemainingMs({
        startedAt,
        nowMs,
        correctCount,
        wrongCount,
        initialBankSeconds,
        correctDeltaSeconds,
        wrongDeltaSeconds,
        creditMs: pause.creditMs,
    });
    const expired = hydrated && remainingMs <= 0 && !frozen;
    const display = hydrated ? formatRemaining(remainingMs) : '--:--';
    const paused = hydrated && pause.active && !expired && !frozen;

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
                            : frozen
                              ? 'font-mono text-base font-semibold tabular-nums text-muted'
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
