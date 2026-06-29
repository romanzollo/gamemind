import { LeaderboardTable } from '@/features/leaderboard/components/leaderboard-table';
import {
    LEADERBOARD_LIMIT,
    leaderboardRepository,
    mapLeaderboardEntries,
} from '@/features/leaderboard/lib';
import { getDictionary, isLocale } from '@/shared/i18n';

// пропсы страницы лидеров
type LeaderboardPageProps = {
    params: Promise<{ locale: string }>;
};

// страница лидеров
export default async function LeaderboardPage({
    params,
}: LeaderboardPageProps) {
    // получаем параметры из URL
    const { locale } = await params;
    // проверяем локаль
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    // получаем результаты лидеров
    const rows = await leaderboardRepository.findBestScores(LEADERBOARD_LIMIT);
    // преобразуем результаты в тип LeaderboardEntry
    const entries = mapLeaderboardEntries(rows);

    // возвращаем страницу лидеров
    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.leaderboard.title}
            </h1>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.leaderboard.description}
            </p>

            <LeaderboardTable
                entries={entries}
                labels={dictionary.leaderboard}
            />
        </main>
    );
}
