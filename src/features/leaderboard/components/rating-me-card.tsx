import type { RatingPointsStanding } from '@/entities/quiz-result/rating-points.repository';
import type { Dictionary, Locale } from '@/shared/i18n';
import { formatPlural } from '@/shared/i18n';
import { buttonClassName, PendingLink } from '@/shared/ui';

/**
 * Карточка «Ты на этой неделе» над таблицей: место, очки, сколько до места
 * выше. Только для текущей недели — в прошлой и «всё время» достаточно
 * подсвеченной строки в таблице.
 *
 * Варианты: есть очки → место и разрыв; вошёл без очков → позвать играть;
 * гость → честно про рейтинг и регистрацию (игры гостя перейдут в аккаунт,
 * ADR «Play without sign-up»). Посетителю без сессии карточку не показываем.
 */

export type RatingMeState =
    | { kind: 'standing'; standing: RatingPointsStanding }
    | { kind: 'noPoints' }
    | { kind: 'guest' };

type RatingMeCardProps = {
    locale: Locale;
    state: RatingMeState;
    labels: Dictionary['leaderboard'];
};

const cardClassName =
    'mt-4 rounded-lg border border-l-4 border-border border-l-primary bg-surface p-4 shadow-sm';

const eyebrowClassName =
    'font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted';

function gapText(
    locale: Locale,
    standing: RatingPointsStanding,
    labels: Dictionary['leaderboard'],
): string {
    const points = (count: number) =>
        formatPlural(locale, count, labels.pointsCount);

    if (standing.pointsAbove === null) {
        // Первый: отрыв от второго; один в таблице — отрыв равен своим очкам.
        return labels.meLeader.replace(
            '{points}',
            points(standing.points - (standing.pointsBelow ?? 0)),
        );
    }

    const placeAbove = String(standing.rank - 1);

    if (standing.pointsAbove === standing.points) {
        return labels.meTie.replace('{place}', placeAbove);
    }

    return labels.meGap
        .replace('{place}', placeAbove)
        .replace('{points}', points(standing.pointsAbove - standing.points));
}

export function RatingMeCard({ locale, state, labels }: RatingMeCardProps) {
    if (state.kind === 'guest') {
        return (
            <section className={cardClassName}>
                <h2 className={eyebrowClassName}>{labels.guestTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed">{labels.guestText}</p>
                <PendingLink
                    href={`/${locale}/register`}
                    className={buttonClassName({
                        className: 'mt-3 w-full justify-center',
                    })}
                >
                    {labels.guestButton}
                </PendingLink>
            </section>
        );
    }

    if (state.kind === 'noPoints') {
        return (
            <section className={cardClassName}>
                <h2 className={eyebrowClassName}>{labels.meTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed">{labels.meNotYet}</p>
                <PendingLink
                    href={`/${locale}`}
                    className={buttonClassName({
                        className: 'mt-3 w-full justify-center',
                    })}
                >
                    {labels.playButton}
                </PendingLink>
            </section>
        );
    }

    const { standing } = state;
    // Полоса — доля моих очков от очков места выше; у лидера — полная.
    const progress =
        standing.pointsAbove === null || standing.pointsAbove === 0
            ? 100
            : Math.min(
                  100,
                  Math.round((standing.points / standing.pointsAbove) * 100),
              );

    return (
        <section className={cardClassName}>
            <h2 className={eyebrowClassName}>{labels.meTitle}</h2>
            <div className="mt-1 flex items-baseline gap-3">
                <p className="flex items-baseline gap-2">
                    <span className="font-display text-4xl font-semibold leading-none tabular-nums">
                        {standing.rank}
                    </span>
                    <span className="text-sm text-muted">
                        {labels.mePlaceOf.replace(
                            '{total}',
                            String(standing.totalPlayers),
                        )}
                    </span>
                </p>
                <p className="ml-auto text-right">
                    <span
                        className="block font-display text-3xl font-semibold leading-none tabular-nums"
                        aria-hidden
                    >
                        {standing.points}
                    </span>
                    <span className="sr-only">
                        {formatPlural(locale, standing.points, labels.pointsCount)}
                    </span>
                    <span className="mt-1 block font-mono text-2xs font-medium text-muted">
                        {formatPlural(locale, standing.games, labels.gamesCount)}
                    </span>
                </p>
            </div>
            <p className="mt-3 text-sm">{gapText(locale, standing, labels)}</p>
            <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"
                aria-hidden
            >
                <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${progress}%` }}
                />
            </div>
        </section>
    );
}
