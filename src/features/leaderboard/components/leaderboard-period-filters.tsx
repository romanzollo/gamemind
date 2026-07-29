import {
    buildLeaderboardHref,
    type LeaderboardFilters,
    type LeaderboardPeriod,
} from '@/features/leaderboard/lib/parse-leaderboard-filters';
import type { Locale } from '@/shared/i18n';
import { PendingLink } from '@/shared/ui';

/**
 * Чипы периода на публичном рейтинге (Scoreboard Editorial).
 *
 * URL `?period=week|month` (omit = all-time) — шарибельная ссылка, не client state.
 * Визуал = тот же segmented control, что у сложности: вторичный chrome, акцент у таблицы.
 * Скользящее окно (7/30 суток), не календарная неделя/месяц — см. parse-leaderboard-filters.
 */

type LeaderboardPeriodFiltersProps = {
    locale: Locale;
    filters: LeaderboardFilters;
    labels: {
        filterPeriodLabel: string;
        filterPeriodAll: string;
        filterPeriodWeek: string;
        filterPeriodMonth: string;
    };
};

type PeriodOption = {
    value: LeaderboardPeriod;
    label: string;
};

export function LeaderboardPeriodFilters({
    locale,
    filters,
    labels,
}: LeaderboardPeriodFiltersProps) {
    const options: PeriodOption[] = [
        { value: 'all', label: labels.filterPeriodAll },
        { value: 'week', label: labels.filterPeriodWeek },
        { value: 'month', label: labels.filterPeriodMonth },
    ];

    return (
        <nav
            className="mt-5"
            aria-label={labels.filterPeriodLabel}
        >
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                {labels.filterPeriodLabel}
            </p>

            <div
                className="flex gap-1 rounded-md border border-border bg-surface p-1"
                role="group"
            >
                {options.map((option) => {
                    const isActive = filters.period === option.value;
                    // Сохраняем difficulty: смена периода не сбрасывает сложность.
                    const href = buildLeaderboardHref(locale, {
                        difficulty: filters.difficulty,
                        period: option.value,
                    });

                    return (
                        <PendingLink
                            key={option.value}
                            href={href}
                            aria-current={isActive ? 'page' : undefined}
                            className={[
                                'min-h-10 flex-1 justify-center rounded-sm px-2 py-2 text-center text-xs font-semibold tracking-wide motion-safe:transition-colors sm:min-h-11 sm:px-3 sm:text-sm',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted hover:bg-surface-hover hover:text-foreground',
                            ].join(' ')}
                        >
                            {option.label}
                        </PendingLink>
                    );
                })}
            </div>
        </nav>
    );
}
