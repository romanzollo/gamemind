import { ratingPointsRepository } from '@/entities/quiz-result/rating-points.repository';
import type { Dictionary, Locale } from '@/shared/i18n';
import { formatPlural } from '@/shared/i18n';
import { PendingLink } from '@/shared/ui';

import { RATING_DAILY_POINTS_CAP, getRatingPeriodWindow } from '../lib/rating-week';

/**
 * «Рейтинг недели» в профиле: место и очки текущей недели + ссылка на
 * таблицу (ROADMAP 4.6e). Рендерить в `<Suspense>`: профиль не ждёт этот
 * запрос; ошибка чтения — блока нет. Гостю не показываем — гости скрыты
 * из рейтингов.
 */

type RatingProfileWeekProps = {
    userId: string;
    locale: Locale;
    dictionary: Dictionary;
};

export async function RatingProfileWeek({
    userId,
    locale,
    dictionary,
}: RatingProfileWeekProps) {
    const labels = dictionary.leaderboard;
    let standing: Awaited<ReturnType<typeof ratingPointsRepository.findStanding>>;

    try {
        standing = await ratingPointsRepository.findStanding(
            {
                ...getRatingPeriodWindow('week'),
                mode: 'all',
                dailyCap: RATING_DAILY_POINTS_CAP,
            },
            userId,
        );
    } catch (error) {
        console.warn('Profile rating load skipped:', error);
        return null;
    }

    return (
        <section className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm">
            <div className="min-w-0 flex-1">
                <h3 className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
                    {labels.weekRatingTitle}
                </h3>
                {standing ? (
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                        <span className="font-display text-xl font-semibold">
                            {labels.resultPlace
                                .replace('{place}', String(standing.rank))
                                .replace('{total}', String(standing.totalPlayers))}
                        </span>
                        <span className="text-sm text-muted">
                            {formatPlural(locale, standing.points, labels.pointsCount)}
                        </span>
                    </p>
                ) : (
                    <p className="mt-1 text-sm text-muted">
                        {labels.profileRatingEmpty}
                    </p>
                )}
            </div>
            <PendingLink
                href={`/${locale}/leaderboard`}
                className="min-h-11 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
                {dictionary.quiz.toLeaderboard}
            </PendingLink>
        </section>
    );
}
