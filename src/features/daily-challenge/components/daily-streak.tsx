'use client';

/**
 * Серия дней Челленджа: счётчик, рекорд, календарь недели ПН–ВС, цель-ачивка и таймер
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
    type DailyStreakDay,
} from '@/features/daily-challenge/lib/compute-daily-streak';
import type { DailyStreakGoal } from '@/features/daily-challenge/lib/resolve-streak-goal';
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
    /** Ближайшая ачивка за серию (resolveStreakGoal); null — все взяты. */
    nextGoal?: DailyStreakGoal | null;
    /** Таймер до следующего челленджа (сегодня уже сыграно). */
    showCountdown?: boolean;
    /** Плашка «Новый рекорд серии» (страница результата). */
    showNewBest?: boolean;
    className?: string;
};

function CheckMark() {
    return (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path
                d="M3.5 8.5l3 3 6-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/** «пн», «вт»… / «Mon»… — из Intl: язык интерфейса, неделя ПН–ВС. */
function weekdayLabel(locale: Locale, dateKey: string): string {
    return new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        timeZone: 'UTC',
    }).format(new Date(`${dateKey}T00:00:00Z`));
}

function dayCellClassName(day: DailyStreakDay): string {
    if (day.played) {
        return day.isToday
            ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-surface'
            : 'bg-primary text-primary-foreground';
    }

    if (day.isToday) {
        return 'border-2 border-primary bg-transparent';
    }

    return day.isFuture
        ? 'border border-dashed border-border bg-transparent'
        : 'border border-border bg-surface';
}

export function DailyStreakSummary({
    streak,
    locale,
    labels,
    nextGoal = null,
    showCountdown = false,
    showNewBest = false,
    className = '',
}: DailyStreakSummaryProps) {
    const playedThisWeek = streak.week.filter((day) => day.played).length;
    const headline =
        streak.current > 0
            ? formatPlural(locale, streak.current, labels.streakDays)
            : labels.streakStart;

    return (
        <div
            className={[
                'rounded-md border border-border bg-surface-muted/50 px-3 py-3 sm:px-4',
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
                className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2"
                aria-label={labels.streakWeekLabel
                    .replace('{played}', String(playedThisWeek))
                    .replace('{elapsed}', String(streak.weekElapsedDays))}
            >
                {streak.week.map((day) => (
                    <li
                        key={day.dateKey}
                        aria-hidden
                        className="flex flex-col items-center gap-1"
                    >
                        <span
                            className={[
                                'font-mono text-[0.65rem] uppercase tracking-[0.08em]',
                                day.isToday
                                    ? 'font-semibold text-foreground'
                                    : 'text-muted',
                            ].join(' ')}
                        >
                            {weekdayLabel(locale, day.dateKey)}
                        </span>
                        <span
                            className={[
                                'flex h-7 w-full items-center justify-center rounded-md',
                                dayCellClassName(day),
                            ].join(' ')}
                        >
                            {day.played ? <CheckMark /> : null}
                        </span>
                    </li>
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

            {streak.perfectWeek ? (
                <p className="mt-2 text-xs font-medium text-success">
                    {labels.streakPerfectWeek}
                </p>
            ) : null}

            {nextGoal && nextGoal.daysLeft > 0 ? (
                <p className="mt-2 text-xs text-muted">
                    {labels.streakNextGoal
                        .replace('{title}', nextGoal.title)
                        .replace(
                            '{days}',
                            formatPlural(
                                locale,
                                nextGoal.daysLeft,
                                labels.dayCount,
                            ),
                        )}
                </p>
            ) : null}

            {showCountdown ? (
                <NextDailyCountdown label={labels.nextChallengeIn} />
            ) : null}
        </div>
    );
}
