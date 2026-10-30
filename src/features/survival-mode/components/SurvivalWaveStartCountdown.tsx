'use client';

/**
 * Заставка «Волна N · 3‑2‑1» до старта банка Survival.
 *
 * Сервер ставит `startedAt` = запись волны + `startDelaySeconds`, поэтому
 * загрузка страницы попадает в паузу, а вопрос появляется ровно на старте
 * банка. Хук только показывает, сколько осталось до `startedAt`: авторитет
 * часов — сервер (isSurvivalClockOk), клиент ничего не «вооружает».
 * До гидрации — заставка без цифры: SSR не знает, сколько паузы осталось,
 * и вопрос не попадает в HTML раньше старта.
 * Canon: docs/DECISIONS.md → Survival Mode MVP (start delay).
 */

import { useEffect, useMemo, useState } from 'react';

import { useHydrated } from '@/shared/ui/use-hydrated';

const TICK_MS = 100;

export type SurvivalWaveStartState = {
    started: boolean;
    /** Целые секунды до старта (3, 2, 1); null — до гидрации. */
    secondsLeft: number | null;
};

export function useSurvivalWaveStart(startedAt: string): SurvivalWaveStartState {
    const hydrated = useHydrated();
    const startedAtMs = useMemo(
        () => new Date(startedAt).getTime(),
        [startedAt],
    );
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        if (Number.isNaN(startedAtMs) || Date.now() >= startedAtMs) {
            return;
        }

        const intervalId = window.setInterval(() => {
            const now = Date.now();
            setNowMs(now);

            if (now >= startedAtMs) {
                window.clearInterval(intervalId);
            }
        }, TICK_MS);

        return () => window.clearInterval(intervalId);
    }, [startedAtMs]);

    if (!hydrated) {
        return { started: false, secondsLeft: null };
    }

    // Битая дата — не держим игрока на заставке.
    if (Number.isNaN(startedAtMs)) {
        return { started: true, secondsLeft: 0 };
    }

    const leftMs = startedAtMs - nowMs;

    return leftMs <= 0
        ? { started: true, secondsLeft: 0 }
        : { started: false, secondsLeft: Math.ceil(leftMs / 1000) };
}

type SurvivalWaveStartCountdownProps = {
    waveLabel: string;
    secondsLeft: number | null;
};

export function SurvivalWaveStartCountdown({
    waveLabel,
    secondsLeft,
}: SurvivalWaveStartCountdownProps) {
    return (
        <div
            className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-10 text-center shadow-sm sm:min-h-96"
            role="status"
            aria-live="polite"
        >
            <p className="font-mono text-xs font-medium tracking-[0.18em] text-muted uppercase">
                {waveLabel}
            </p>
            <p
                // key перезапускает анимацию на каждой новой цифре.
                key={secondsLeft ?? 'pending'}
                className="mt-3 font-display text-8xl leading-none font-semibold tabular-nums text-foreground motion-safe:animate-[gm-countdown-tick_360ms_cubic-bezier(0.2,0.8,0.2,1)_both] sm:text-9xl"
                aria-hidden={secondsLeft == null}
            >
                {secondsLeft ?? ' '}
            </p>
        </div>
    );
}
