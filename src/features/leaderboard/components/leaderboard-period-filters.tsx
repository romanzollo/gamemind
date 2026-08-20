import {
    leaderboardFilterChipClassName,
    leaderboardFilterChipStateClassName,
    leaderboardFilterLabelClassName,
} from '@/features/leaderboard/components/leaderboard-filter-chrome';
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
 * Живая доска = week (omit в URL). All-time — явная вкладка `?period=all`.
 * Скользящее окно (7/30 суток), не календарный понедельник.
 * Три чипа влезают в один ряд даже на 320px; nowrap, чтобы «Всё время»
 * не ломалось по буквам. См. parse-leaderboard-filters; DECISIONS Layer 1.
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
    // Неделя первой: это живая гонка, не зал славы.
    const options: PeriodOption[] = [
        { value: 'week', label: labels.filterPeriodWeek },
        { value: 'month', label: labels.filterPeriodMonth },
        { value: 'all', label: labels.filterPeriodAll },
    ];

    return (
        <nav className="mt-3" aria-label={labels.filterPeriodLabel}>
            <p className={leaderboardFilterLabelClassName}>
                {labels.filterPeriodLabel}
            </p>

            <div
                className="flex gap-1 rounded-md border border-border bg-surface p-1"
                role="group"
            >
                {options.map((option) => {
                    const isActive = filters.period === option.value;
                    // Смена периода не сбрасывает режим и сложность.
                    const href = buildLeaderboardHref(locale, {
                        mode: filters.mode,
                        difficulty: filters.difficulty,
                        period: option.value,
                    });

                    return (
                        <PendingLink
                            key={option.value}
                            href={href}
                            aria-current={isActive ? 'page' : undefined}
                            className={[
                                leaderboardFilterChipClassName,
                                'flex-1',
                                leaderboardFilterChipStateClassName(isActive),
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
