import {
    buildLeaderboardHref,
    type LeaderboardFilters,
    type LeaderboardMode,
} from '@/features/leaderboard/lib/parse-leaderboard-filters';
import type { Locale } from '@/shared/i18n';
import { PendingLink } from '@/shared/ui';

/**
 * Чипы режима на публичном рейтинге (Scoreboard Editorial).
 *
 * Classic / Blitz / Daily / Survival — взаимоисключающие доски: разные потолки,
 * нельзя смешивать в одном DISTINCT ON. Нет чипа «все режимы».
 * URL `?mode=blitz|daily` (omit = classic) — шарибельная ссылка, не client state.
 *
 * Тот же segmented control, что у периода: вторичный chrome, акцент у таблицы.
 * См. DECISIONS.md → Leaderboard retention meta — Layer 1.
 */

type LeaderboardModeFiltersProps = {
    locale: Locale;
    filters: LeaderboardFilters;
    labels: {
        filterModeLabel: string;
        filterModeClassic: string;
        filterModeBlitz: string;
        filterModeDaily: string;
        filterModeSurvival: string;
    };
};

type ModeOption = {
    value: LeaderboardMode;
    label: string;
};

export function LeaderboardModeFilters({
    locale,
    filters,
    labels,
}: LeaderboardModeFiltersProps) {
    const options: ModeOption[] = [
        { value: 'classic', label: labels.filterModeClassic },
        { value: 'blitz', label: labels.filterModeBlitz },
        { value: 'daily', label: labels.filterModeDaily },
        { value: 'survival', label: labels.filterModeSurvival },
    ];

    return (
        <nav
            className="mt-5"
            aria-label={labels.filterModeLabel}
        >
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                {labels.filterModeLabel}
            </p>

            <div
                className="flex gap-1 rounded-md border border-border bg-surface p-1"
                role="group"
            >
                {options.map((option) => {
                    const isActive = filters.mode === option.value;
                    // Смена режима не должна сбрасывать неделю и сложность.
                    const href = buildLeaderboardHref(locale, {
                        mode: option.value,
                        period: filters.period,
                        difficulty: filters.difficulty,
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
