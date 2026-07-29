import { LeaderboardDifficultyFilters } from '@/features/leaderboard/components/leaderboard-difficulty-filters';
import { LeaderboardTable } from '@/features/leaderboard/components/leaderboard-table';
import {
    hasActiveLeaderboardFilters,
    LEADERBOARD_LIMIT,
    leaderboardRepository,
    mapLeaderboardEntries,
    parseLeaderboardFilters,
} from '@/features/leaderboard/lib';
import { getDictionary, isLocale } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

type LeaderboardPageProps = {
    params: Promise<{ locale: string }>;
    /** URL-фильтр рейтинга (`?difficulty=`); Next.js 15+ — Promise. */
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeaderboardPage({
    params,
    searchParams,
}: LeaderboardPageProps) {
    const { locale } = await params;
    const rawSearchParams = await searchParams;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    // URL → Zod safe defaults → SQL; битый query не роняет страницу.
    const filters = parseLeaderboardFilters(rawSearchParams);
    const filtersActive = hasActiveLeaderboardFilters(filters);

    let entries: ReturnType<typeof mapLeaderboardEntries> = [];
    let loadErrorMessage: string | undefined;

    try {
        const rows = await leaderboardRepository.findBestScores(
            LEADERBOARD_LIMIT,
            filters,
        );
        entries = mapLeaderboardEntries(rows);
    } catch {
        loadErrorMessage = dictionary.leaderboard.loadFailed;
    }

    const tableLabels = {
        ...dictionary.leaderboard,
        empty: filtersActive
            ? dictionary.leaderboard.emptyFiltered
            : dictionary.leaderboard.empty,
    };

    return (
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {dictionary.leaderboard.title}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted">
                {dictionary.leaderboard.description}
            </p>

            <LeaderboardDifficultyFilters
                locale={safeLocale}
                filters={filters}
                labels={{
                    filterDifficultyLabel:
                        dictionary.leaderboard.filterDifficultyLabel,
                    filterAll: dictionary.leaderboard.filterAll,
                    easy: dictionary.quiz.easy,
                    medium: dictionary.quiz.medium,
                    hard: dictionary.quiz.hard,
                }}
            />

            {loadErrorMessage ? (
                <InlineAlert className="mt-6">{loadErrorMessage}</InlineAlert>
            ) : null}

            {!loadErrorMessage ? (
                <LeaderboardTable
                    entries={entries}
                    locale={safeLocale}
                    labels={tableLabels}
                />
            ) : null}
        </main>
    );
}
