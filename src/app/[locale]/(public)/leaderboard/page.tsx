import { LeaderboardTable } from '@/features/leaderboard/components/leaderboard-table';
import {
    LEADERBOARD_LIMIT,
    leaderboardRepository,
    mapLeaderboardEntries,
} from '@/features/leaderboard/lib';
import { getDictionary, isLocale } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

type LeaderboardPageProps = {
    params: Promise<{ locale: string }>;
};

export default async function LeaderboardPage({
    params,
}: LeaderboardPageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    let entries: ReturnType<typeof mapLeaderboardEntries> = [];
    let loadErrorMessage: string | undefined;

    try {
        const rows =
            await leaderboardRepository.findBestScores(LEADERBOARD_LIMIT);
        entries = mapLeaderboardEntries(rows);
    } catch {
        loadErrorMessage = dictionary.leaderboard.loadFailed;
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-6 sm:p-8">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {dictionary.leaderboard.title}
            </h1>
            <p className="mt-2 text-sm text-muted sm:text-base">
                {dictionary.leaderboard.description}
            </p>

            {loadErrorMessage ? (
                <InlineAlert className="mt-4">{loadErrorMessage}</InlineAlert>
            ) : null}

            <LeaderboardTable
                entries={entries}
                labels={dictionary.leaderboard}
            />
        </main>
    );
}
