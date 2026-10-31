'use client';

/**
 * Серия дней Челленджа: счётчик, рекорд, полоска последних 7 дней и таймер
 * до следующего челленджа (лобби и результат Челленджа).
 *
 * Данные считает сервер (computeDailyStreak) — сюда приходит готовый
 * DailyStreak. Значок — SVG, не эмодзи (docs/TASTE_SKILL.md). Таймер идёт
 * по часам сервера (server-clock) до полуночи по Москве; в полночь
 * обновляет страницу — появляется новый челлендж.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
    msUntilNextMoscowDay,
    type DailyStreak,
} from '@/features/daily-challenge/lib/compute-daily-streak';
import { formatPlural, type Dictionary, type Locale } from '@/shared/i18n';
import { serverNow, useServerClockReady } from '@/shared/ui/server-clock';
import { useHydrated } from '@/shared/ui/use-hydrated';

type DailyStreakLabels = Dictionary['dailyChallenge'];

function StreakFlameMark({ active }: { active: boolean }) {
    return (
        <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            aria-hidden
            className={active ? 'shrink-0 text-warning' : 'shrink-0 text-muted'}
        >
            <path
                fill="currentColor"
                d="M8.2 1.2c.5 2.4-.5 3.7-1.6 5C5.5 7.4 4.4 8.6 4.4 10.4A3.6 3.6 0 0 0 8 14a3.6 3.6 0 0 0 3.6-3.6c0-1.7-.8-2.8-1.5-3.6.1 1.1-.3 2-1.1 2.3.4-2-.1-4.9-.8-7.9Z"
            />
        </svg>
    );
}

function formatHms(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
        .map((part) => String(part).padStart(2, '0'))
        .join(':');
}

export function NextDailyCountdown({ label }: { label: string }) {
    const router = useRouter();
    const hydrated = useHydrated();
    useServerClockReady();
    const [nowMs, setNowMs] = useState(() => serverNow());
    const lastLeftRef = useRef<number | null>(null);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            const now = serverNow();
            const left = msUntilNextMoscowDay(now);
            // Перескок «00:00:00 → 24:00:00» = наступили новые сутки по Москве.
            if (lastLeftRef.current != null && left > lastLeftRef.current) {
                router.refresh();
            }
            lastLeftRef.current = left;
            setNowMs(now);
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [router]);

    const time = hydrated
        ? formatHms(msUntilNextMoscowDay(nowMs))
        : '--:--:--';

    return (
        <p className="mt-2 font-mono text-xs tabular-nums text-muted">
            {label.replace('{time}', time)}
        </p>
    );
}

type DailyStreakSummaryProps = {
    streak: DailyStreak;
    locale: Locale;
    labels: DailyStreakLabels;
    /** Таймер до следующего челленджа (сегодня уже сыграно). */
    showCountdown?: boolean;
    /** Плашка «Новый рекорд серии» (страница результата). */
    showNewBest?: boolean;
    className?: string;
};

export function DailyStreakSummary({
    streak,
    locale,
    labels,
    showCountdown = false,
    showNewBest = false,
    className = '',
}: DailyStreakSummaryProps) {
    const playedCount = streak.lastDays.filter((day) => day.played).length;
    const headline =
        streak.current > 0
            ? formatPlural(locale, streak.current, labels.streakDays)
            : labels.streakStart;

    return (
        <div
            className={[
                'rounded-md border border-border bg-surface-muted/50 px-3 py-2.5 sm:px-4',
                className,
            ].join(' ')}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p
                    className={[
                        'flex items-center gap-1.5',
                        streak.current > 0
                            ? 'font-display text-lg font-semibold tabular-nums tracking-tight text-foreground'
                            : 'text-sm font-medium text-foreground',
                    ].join(' ')}
                >
                    <StreakFlameMark active={streak.current > 0} />
                    {headline}
                </p>
                {streak.best > 0 ? (
                    <p className="font-mono text-xs tabular-nums text-muted">
                        {labels.streakBest.replace('{n}', String(streak.best))}
                    </p>
                ) : null}
            </div>

            <ol
                className="mt-2 flex gap-1.5"
                aria-label={labels.streakLastDaysLabel.replace(
                    '{played}',
                    String(playedCount),
                )}
            >
                {streak.lastDays.map((day) => (
                    <li
                        key={day.dateKey}
                        aria-hidden
                        className={[
                            'h-2 flex-1 rounded-sm',
                            day.played ? 'bg-primary' : 'bg-border',
                            day.isToday
                                ? 'ring-1 ring-primary ring-offset-1 ring-offset-surface'
                                : '',
                        ].join(' ')}
                    />
                ))}
            </ol>

            {streak.atRisk ? (
                <p className="mt-2 text-xs font-medium text-warning">
                    {labels.streakAtRisk}
                </p>
            ) : null}

            {showNewBest && streak.isNewBest ? (
                <p className="mt-2 text-xs font-medium text-success">
                    {labels.streakNewBest}
                </p>
            ) : null}

            {showCountdown ? (
                <NextDailyCountdown label={labels.nextChallengeIn} />
            ) : null}
        </div>
    );
}
