import { ratingPointsRepository } from '@/entities/quiz-result/rating-points.repository';
import type { Dictionary, Locale } from '@/shared/i18n';
import { formatPlural } from '@/shared/i18n';

import {
    resolveRatingGameOutcome,
    type RatingGameOutcome,
} from '../lib/rating-game-outcome';
import { RATING_DAILY_POINTS_CAP, getRatingPeriodWindow } from '../lib/rating-week';

/**
 * «Рейтинг недели» под результатом игры: +N очков, место, на сколько выше
 * (ROADMAP 4.6e, ADR «Weekly rating points»).
 *
 * Горячий путь: рендерить только внутри `<Suspense fallback={null}>` под
 * карточкой счёта — счёт и кнопки показываются без этого запроса. Сдачу
 * не трогает: читает готовые `QuizResult` / `QuizSession`, без JSONB.
 * Ошибка чтения — блока просто нет (soft-miss), без throw и `notFound()`.
 */

type RatingGameResultProps = {
    sessionId: string;
    userId: string;
    locale: Locale;
    score: number;
    isTopicGame: boolean;
    isSurvival: boolean;
    survivalClockOk: boolean | null;
    dictionary: Dictionary;
};

async function loadOutcome(
    props: RatingGameResultProps,
): Promise<RatingGameOutcome> {
    const base = {
        score: props.score,
        isTopicGame: props.isTopicGame,
        isGuest: false,
        isSurvival: props.isSurvival,
        survivalClockOk: props.survivalClockOk,
    };

    // Тема и плохие часы известны без запроса.
    if (props.isTopicGame || (props.isSurvival && props.survivalClockOk !== true)) {
        return resolveRatingGameOutcome({ ...base, contribution: null });
    }

    try {
        const contribution = await ratingPointsRepository.findGameContribution(
            {
                ...getRatingPeriodWindow('week'),
                mode: 'all',
                dailyCap: RATING_DAILY_POINTS_CAP,
            },
            props.userId,
            props.sessionId,
        );

        return resolveRatingGameOutcome({ ...base, contribution });
    } catch (error) {
        console.warn('Rating gain load skipped:', error);
        return { kind: 'none' };
    }
}

export async function RatingGameResult(props: RatingGameResultProps) {
    const outcome = await loadOutcome(props);
    const labels = props.dictionary.leaderboard;

    if (outcome.kind === 'none') {
        return null;
    }

    const eyebrow = (
        <h2 className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
            {labels.weekRatingTitle}
        </h2>
    );
    const cardClassName =
        'mt-4 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm';

    if (outcome.kind === 'topic') {
        return (
            <section className={cardClassName}>
                {eyebrow}
                <p className="mt-1 text-sm text-muted">{labels.resultTopic}</p>
            </section>
        );
    }

    if (outcome.kind === 'capped') {
        return (
            <section className={cardClassName}>
                {eyebrow}
                <p className="mt-1 text-sm text-muted">{labels.resultCapReached}</p>
            </section>
        );
    }

    const place = labels.resultPlace
        .replace('{place}', String(outcome.place))
        .replace('{total}', String(outcome.total));
    const movement = outcome.newEntry
        ? labels.resultNewEntry
        : outcome.movedUp
          ? labels.resultMovedUp.replace(
                '{places}',
                formatPlural(props.locale, outcome.movedUp, labels.placesCount),
            )
          : null;

    return (
        <section className={cardClassName}>
            {eyebrow}
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-display text-2xl font-semibold tabular-nums text-primary">
                    {labels.resultGain.replace(
                        '{points}',
                        formatPlural(props.locale, outcome.gain, labels.pointsCount),
                    )}
                </p>
                <p className="text-sm font-medium">{place}</p>
                {movement ? (
                    <p className="font-mono text-xs font-medium text-success">
                        {movement}
                    </p>
                ) : null}
            </div>
            {outcome.capReached ? (
                <p className="mt-1 text-xs text-muted">{labels.resultCapReached}</p>
            ) : null}
        </section>
    );
}
