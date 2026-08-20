import {
    leaderboardFilterChipClassName,
    leaderboardFilterChipStateClassName,
    leaderboardFilterLabelClassName,
} from '@/features/leaderboard/components/leaderboard-filter-chrome';
import {
    buildLeaderboardHref,
    type LeaderboardDifficultyFilter,
    type LeaderboardFilters,
} from '@/features/leaderboard/lib/parse-leaderboard-filters';
import type { Locale } from '@/shared/i18n';
import { PendingLink } from '@/shared/ui';

/**
 * Чипы фильтра сложности на публичном рейтинге (Scoreboard Editorial).
 *
 * Навигация через URL (`?difficulty=`), не client state — можно шарить ссылку.
 * Смена сложности сохраняет mode и period (неделя/блиц не сбрасываются).
 * PendingLink: лёгкий opacity при soft navigation (§11.9).
 *
 * Пять чипов: на узком экране 3+2 (basis ~30%), на sm+ один ряд.
 * Mix ≠ Medium в SQL. Короткая подпись — `filterMixed`.
 */

type LeaderboardDifficultyFiltersProps = {
    locale: Locale;
    filters: LeaderboardFilters;
    labels: {
        filterDifficultyLabel: string;
        filterAll: string;
        easy: string;
        medium: string;
        hard: string;
        filterMixed: string;
    };
};

type FilterOption = {
    value: LeaderboardDifficultyFilter;
    label: string;
};

export function LeaderboardDifficultyFilters({
    locale,
    filters,
    labels,
}: LeaderboardDifficultyFiltersProps) {
    const options: FilterOption[] = [
        { value: 'all', label: labels.filterAll },
        { value: 'EASY', label: labels.easy },
        { value: 'MEDIUM', label: labels.medium },
        { value: 'HARD', label: labels.hard },
        { value: 'MIXED', label: labels.filterMixed },
    ];

    return (
        <nav
            className="mt-3 border-b border-border pb-4"
            aria-label={labels.filterDifficultyLabel}
        >
            <p className={leaderboardFilterLabelClassName}>
                {labels.filterDifficultyLabel}
            </p>

            <div
                className="flex flex-wrap gap-1 rounded-md border border-border bg-surface p-1 sm:flex-nowrap"
                role="group"
            >
                {options.map((option) => {
                    const isActive = filters.difficulty === option.value;
                    // Смена сложности не сбрасывает режим и окно дат.
                    const href = buildLeaderboardHref(locale, {
                        mode: filters.mode,
                        difficulty: option.value,
                        period: filters.period,
                    });

                    return (
                        <PendingLink
                            key={option.value}
                            href={href}
                            aria-current={isActive ? 'page' : undefined}
                            className={[
                                leaderboardFilterChipClassName,
                                'flex-[1_1_30%] sm:flex-1',
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
