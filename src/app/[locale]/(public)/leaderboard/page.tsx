import { RatingMeCard, type RatingMeState } from '@/features/leaderboard/components/rating-me-card';
import { RatingPeriodSwitch } from '@/features/leaderboard/components/rating-period-switch';
import { RatingRecords } from '@/features/leaderboard/components/rating-records';
import { RatingTable } from '@/features/leaderboard/components/rating-table';
import {
    getMoscowWeekStart,
    getNextMoscowWeekStart,
    getRatingPeriodWindow,
    RATING_BOARD_LIMIT,
    RATING_DAILY_POINTS_CAP,
    ratingPointsRepository,
    type RatingPeriod,
} from '@/features/leaderboard/lib';
import { buildRatingHref, parseRatingPeriod } from '@/features/leaderboard/lib/rating-period-params';
import { formatTimeLeft, formatWeekRange } from '@/features/leaderboard/lib/rating-format';
import { auth } from '@/lib/auth';
import { getDictionary, isLocale, type Dictionary, type Locale } from '@/shared/i18n';
import { buttonClassName, EmptyState, InlineAlert, PendingLink } from '@/shared/ui';

/**
 * Рейтинг — очки за период по всем режимам (ADR «Weekly rating points»).
 *
 * Один переключатель — период (`?period=last|all`, по умолчанию текущая
 * неделя МСК). Сверху карточка «я» (только текущая неделя), дальше таблица
 * с разбивкой по режимам в строке и рекорды Блица и Выживания.
 *
 * Публичная страница: сессия нужна только для карточки и подсветки своей
 * строки. Чтение — `withDirectPgClient`, без JSONB; ошибка чтения — плашка,
 * не 500 и не `notFound()`.
 */

type LeaderboardPageProps = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function periodMeta(
    period: RatingPeriod,
    locale: Locale,
    now: Date,
    labels: Dictionary['leaderboard'],
): string {
    if (period === 'all') {
        return labels.allTimeMeta;
    }

    const weekStart = getMoscowWeekStart(now);

    if (period === 'lastWeek') {
        const lastWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS);

        return labels.lastWeekMeta.replace(
            '{range}',
            formatWeekRange(locale, lastWeekStart),
        );
    }

    return labels.weekMeta
        .replace('{range}', formatWeekRange(locale, weekStart))
        .replace(
            '{left}',
            formatTimeLeft(getNextMoscowWeekStart(now).getTime() - now.getTime(), {
                daysShort: labels.daysShort,
                hoursShort: labels.hoursShort,
            }),
        );
}

function emptyText(period: RatingPeriod, labels: Dictionary['leaderboard']) {
    if (period === 'lastWeek') {
        return { title: labels.emptyLastWeek, description: undefined };
    }

    if (period === 'all') {
        return { title: labels.emptyAllTime, description: undefined };
    }

    return { title: labels.empty, description: labels.emptyWeekText };
}

export default async function LeaderboardPage({
    params,
    searchParams,
}: LeaderboardPageProps) {
    const { locale } = await params;
    const safeLocale: Locale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const labels = dictionary.leaderboard;
    const period = parseRatingPeriod(await searchParams);
    const now = new Date();
    const periodWindow = getRatingPeriodWindow(period, now);
    const filters = {
        ...periodWindow,
        mode: 'all' as const,
        dailyCap: RATING_DAILY_POINTS_CAP,
    };

    const session = await auth();
    const user = session?.user?.id
        ? { id: session.user.id, isGuest: session.user.isGuest === true }
        : null;
    // Гость скрыт из рейтингов — его место не ищем.
    const standingUserId = user && !user.isGuest ? user.id : null;

    let loadFailed = false;
    let board: Awaited<ReturnType<typeof ratingPointsRepository.findBoard>> = [];
    let records: Awaited<ReturnType<typeof ratingPointsRepository.findRecords>> =
        { blitz: null, survival: null };
    let standing: Awaited<
        ReturnType<typeof ratingPointsRepository.findStanding>
    > = null;

    try {
        [board, records, standing] = await Promise.all([
            ratingPointsRepository.findBoard(filters, RATING_BOARD_LIMIT),
            ratingPointsRepository.findRecords(periodWindow),
            standingUserId
                ? ratingPointsRepository.findStanding(filters, standingUserId)
                : Promise.resolve(null),
        ]);
    } catch {
        loadFailed = true;
    }

    const meState: RatingMeState | null =
        period !== 'week' || !user || loadFailed
            ? null
            : user.isGuest
              ? { kind: 'guest' }
              : standing
                ? { kind: 'standing', standing }
                : { kind: 'noPoints' };
    const trailingEntry =
        standing && standing.rank > board.length ? standing : null;
    const empty = emptyText(period, labels);

    return (
        <main className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-10">
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {labels.title}
            </h1>
            <p className="mt-1 font-mono text-xs text-muted">
                {periodMeta(period, safeLocale, now, labels)}
            </p>

            <RatingPeriodSwitch locale={safeLocale} period={period} labels={labels} />

            {meState ? (
                <RatingMeCard locale={safeLocale} state={meState} labels={labels} />
            ) : null}

            {loadFailed ? (
                <InlineAlert className="mt-6">{labels.loadFailed}</InlineAlert>
            ) : board.length === 0 ? (
                <EmptyState
                    className="mt-5"
                    title={empty.title}
                    description={empty.description}
                    action={
                        period === 'week' ? (
                            <div className="flex w-full max-w-xs flex-col gap-2">
                                <PendingLink
                                    href={`/${safeLocale}`}
                                    className={buttonClassName({
                                        className: 'w-full justify-center',
                                    })}
                                >
                                    {labels.playButton}
                                </PendingLink>
                                <PendingLink
                                    href={buildRatingHref(safeLocale, 'lastWeek')}
                                    className={buttonClassName({
                                        variant: 'secondary',
                                        className: 'w-full justify-center',
                                    })}
                                >
                                    {labels.lastWeekLink}
                                </PendingLink>
                            </div>
                        ) : undefined
                    }
                />
            ) : (
                <RatingTable
                    entries={board}
                    trailingEntry={trailingEntry}
                    currentUserId={standingUserId}
                    showWinner={period === 'lastWeek'}
                    labels={labels}
                />
            )}

            {loadFailed ? null : (
                <RatingRecords
                    locale={safeLocale}
                    period={period}
                    records={records}
                    labels={labels}
                />
            )}

            <details className="mt-6 rounded-md border border-border bg-surface px-3 py-2">
                <summary className="flex min-h-11 cursor-pointer select-none items-center font-mono text-xs font-medium uppercase tracking-wider text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {labels.scoringDetailsLabel}
                </summary>
                <p className="pb-2 text-sm leading-relaxed text-muted">
                    {labels.scoringDetails}
                </p>
            </details>
        </main>
    );
}
