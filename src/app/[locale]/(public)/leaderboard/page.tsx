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
        <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {dictionary.leaderboard.title}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted">
                {dictionary.leaderboard.description}
            </p>

            {loadErrorMessage ? (
                <InlineAlert className="mt-6">{loadErrorMessage}</InlineAlert>
            ) : null}

            <LeaderboardTable
                entries={entries}
                locale={safeLocale}
                labels={dictionary.leaderboard}
            />
        </main>
    );
}
