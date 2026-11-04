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
    /** «Банк на старте: 20 с», «12 вопросов» — части не переносятся внутри. */
    waveFacts: string[];
    ruleCorrect: string;
    ruleWrong: string;
};

/**
 * Заставка раунда: волна, цифра в кольце, банк и правило. Пока цифр нет
 * (первые секунды паузы) — та же карточка без цифры: банк и правило
 * читаются заранее. Только вид: время считает `useSurvivalWaveStart`.
 */
export function SurvivalWaveStartCountdown({
    waveLabel,
    secondsLeft,
    waveFacts,
    ruleCorrect,
    ruleWrong,
}: SurvivalWaveStartCountdownProps) {
    return (
        <div
            className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-border bg-surface px-6 py-8 text-center shadow-sm sm:min-h-96"
            role="status"
            aria-live="polite"
            data-testid="survival-wave-countdown"
        >
            <p className="font-mono text-xs font-medium tracking-[0.18em] text-muted uppercase">
                {waveLabel}
            </p>

            <div className="relative mt-4 flex size-36 items-center justify-center sm:size-44">
                <svg
                    viewBox="0 0 100 100"
                    className="absolute inset-0 size-full -rotate-90"
                    aria-hidden
                >
                    <circle
                        cx={50}
                        cy={50}
                        r={46}
                        fill="none"
                        strokeWidth={4}
                        className="stroke-border"
                    />
                    {secondsLeft != null ? (
                        <circle
                            // key перезапускает кольцо на каждой новой цифре.
                            key={secondsLeft}
                            cx={50}
                            cy={50}
                            r={46}
                            fill="none"
                            strokeWidth={4}
                            strokeLinecap="round"
                            pathLength={100}
                            strokeDasharray={100}
                            className="stroke-primary motion-safe:animate-countdown-ring"
                        />
                    ) : null}
                </svg>
                <p
                    // key перезапускает анимацию на каждой новой цифре.
                    key={secondsLeft ?? 'pending'}
                    className="font-display text-7xl leading-none font-semibold tabular-nums text-foreground motion-safe:animate-countdown-tick sm:text-8xl"
                    aria-hidden={secondsLeft == null}
                >
                    {secondsLeft ?? ' '}
                </p>
            </div>

            <p className="mt-4 font-mono text-sm tabular-nums text-foreground">
                {waveFacts.map((fact, index) => (
                    <span key={fact} className="whitespace-nowrap">
                        {index > 0 ? ' · ' : null}
                        {fact}
                    </span>
                ))}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm font-medium">
                <span className="rounded-md bg-success-muted px-2.5 py-1 text-success">
                    {ruleCorrect}
                </span>
                <span className="rounded-md bg-danger-muted px-2.5 py-1 text-danger">
                    {ruleWrong}
                </span>
            </div>
        </div>
    );
}
