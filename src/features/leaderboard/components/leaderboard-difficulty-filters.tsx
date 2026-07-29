import {
    buildLeaderboardHref,
    type LeaderboardFilters,
} from '@/features/leaderboard/lib/parse-leaderboard-filters';
import type { Locale } from '@/shared/i18n';
import { PendingLink } from '@/shared/ui';
import type { Difficulty } from '@/types';

/**
 * Чипы фильтра сложности на публичном рейтинге (Scoreboard Editorial).
 *
 * Навигация через URL (`?difficulty=`), не client state — можно шарить ссылку.
 * PendingLink: лёгкий opacity при soft navigation (§11.9).
 *
 * Визуал: segmented control (один ряд в рамке), не 2×2 «кнопочная панель» —
 * фильтр = вторичный chrome под заголовком, акцент остаётся у таблицы очков.
 * Подписи easy/medium/hard — из quiz dictionary (один источник правды).
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
    };
};

type FilterOption = {
    value: Difficulty | 'all';
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
    ];

    return (
        <nav
            className="mt-5 border-b border-border pb-5"
            aria-label={labels.filterDifficultyLabel}
        >
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                {labels.filterDifficultyLabel}
            </p>

            <div
                className="flex gap-1 rounded-md border border-border bg-surface p-1"
                role="group"
            >
                {options.map((option) => {
                    const isActive = filters.difficulty === option.value;
                    const href = buildLeaderboardHref(locale, {
                        difficulty: option.value,
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
