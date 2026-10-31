'use client';

/**
 * Заставка «Волна N · 3‑2‑1» до старта банка Survival.
 *
 * Сервер ставит `startedAt` = запись волны + `startDelaySeconds`, поэтому
 * загрузка страницы попадает в паузу, а вопрос появляется ровно на старте
 * банка. Хук только показывает, сколько осталось до `startedAt` по часам
 * сервера (server-clock): авторитет — сервер (isSurvivalClockOk), клиент
 * ничего не «вооружает». Цифры — только последние `startCountdownSeconds`
 * паузы, до того «Волна N»: отсчёт всегда целый 3‑2‑1.
 * До гидрации и до замера часов — заставка без цифры: вопрос не попадает в
 * HTML раньше старта, а спешащие часы устройства не «съедают» отсчёт.
 * Canon: docs/DECISIONS.md → Survival Mode MVP (start delay).
 */

import { useEffect, useMemo, useState } from 'react';

import { SURVIVAL_MODE_MVP_RULES } from '@/features/survival-mode/types';
import { serverNow, useServerClockReady } from '@/shared/ui/server-clock';
import { useHydrated } from '@/shared/ui/use-hydrated';

const TICK_MS = 100;

export type SurvivalWaveStartState = {
    started: boolean;
    /** Цифра отсчёта (3, 2, 1); null — ещё рано для цифр или нет замера. */
    secondsLeft: number | null;
};

const PENDING: SurvivalWaveStartState = { started: false, secondsLeft: null };

export function useSurvivalWaveStart(startedAt: string): SurvivalWaveStartState {
    const hydrated = useHydrated();
    const clockReady = useServerClockReady();
    const startedAtMs = useMemo(
        () => new Date(startedAt).getTime(),
        [startedAt],
    );
    // null — ещё не было тика после замера часов: не решаем «рано/пора».
    const [nowMs, setNowMs] = useState<number | null>(null);

    useEffect(() => {
        if (!clockReady || Number.isNaN(startedAtMs)) {
            return;
        }

        const intervalId = window.setInterval(() => {
            const now = serverNow();
            setNowMs(now);

            if (now >= startedAtMs) {
                window.clearInterval(intervalId);
            }
        }, TICK_MS);

        return () => window.clearInterval(intervalId);
    }, [clockReady, startedAtMs]);

    if (!hydrated) {
        return PENDING;
    }

    // Битая дата — не держим игрока на заставке.
    if (Number.isNaN(startedAtMs)) {
        return { started: true, secondsLeft: 0 };
    }

    if (nowMs == null) {
        return PENDING;
    }

    const leftMs = startedAtMs - nowMs;

    if (leftMs <= 0) {
        return { started: true, secondsLeft: 0 };
    }

    const secondsLeft = Math.ceil(leftMs / 1000);

    return {
        started: false,
        secondsLeft:
            secondsLeft <= SURVIVAL_MODE_MVP_RULES.startCountdownSeconds
                ? secondsLeft
                : null,
    };
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
