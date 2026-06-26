import { getDictionary, isLocale } from '@/shared/i18n';

type LeaderboardPageProps = {
    params: Promise<{ locale: string }>;
};

export default async function LeaderboardPage({
    params,
}: LeaderboardPageProps) {
    const { locale } = await params;
    const dictionary = getDictionary(isLocale(locale) ? locale : 'ru');

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.leaderboard.title}
            </h1>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.leaderboard.description}
            </p>
        </main>
    );
}
