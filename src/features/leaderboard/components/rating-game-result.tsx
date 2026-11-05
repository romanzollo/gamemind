import type { CSSProperties } from 'react';

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

/** Цвет плашки места: медали топ-3 (токены podium-*), дальше — нейтральная. */
function placeStyle(place: number): CSSProperties | undefined {
    if (place === 1) {
        return { backgroundColor: 'var(--podium-gold)', color: 'var(--podium-gold-fg)' };
    }

    if (place === 2) {
        return { backgroundColor: 'var(--podium-silver)', color: 'var(--podium-silver-fg)' };
    }

    if (place === 3) {
        return { backgroundColor: 'var(--podium-bronze)', color: 'var(--podium-bronze-fg)' };
    }

    return undefined;
}

type RatingGameResultViewProps = {
    outcome: Exclude<RatingGameOutcome, { kind: 'none' }>;
    locale: Locale;
    labels: Dictionary['leaderboard'];
};

/**
 * Вид блока без загрузки данных. Сверху: «+N очков» крупно и плашка места
 * (медаль для топ-3); под чертой — одна строка статуса: отрыв лидера,
 * «Ты в таблице» или «выше на N мест». Статус не только цветом — словами.
 */
export function RatingGameResultView({
    outcome,
    locale,
    labels,
}: RatingGameResultViewProps) {
    const eyebrow = (
        <h2 className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
            {labels.weekRatingTitle}
        </h2>
    );
    const cardClassName =
        'mt-4 rounded-lg border border-border bg-surface px-4 py-3 shadow-sm';

    if (outcome.kind === 'topic' || outcome.kind === 'capped') {
        return (
            <section className={cardClassName}>
                {eyebrow}
                <p className="mt-1 text-sm text-muted">
                    {outcome.kind === 'topic'
                        ? labels.resultTopic
                        : labels.resultCapReached}
                </p>
            </section>
        );
    }

    const points = (count: number) =>
        formatPlural(locale, count, labels.pointsCount);
    const place = labels.resultPlace
        .replace('{place}', String(outcome.place))
        .replace('{total}', String(outcome.total));
    // Одна строка статуса: лидерство важнее «вошёл / поднялся».
    const status =
        outcome.lead !== null
            ? { text: labels.meLeader.replace('{points}', points(outcome.lead)), up: false }
            : outcome.newEntry
              ? { text: labels.resultNewEntry, up: true }
              : outcome.movedUp
                ? {
                      text: labels.resultMovedUp.replace(
                          '{places}',
                          formatPlural(locale, outcome.movedUp, labels.placesCount),
                      ),
                      up: true,
                  }
                : null;
    const medal = placeStyle(outcome.place);

    return (
        <section className={cardClassName}>
            {eyebrow}
            {/* «+N» и место — одной строкой; на узком экране место уходит ниже, а не ломает «+N». */}
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="whitespace-nowrap font-display text-3xl font-semibold leading-none tabular-nums text-primary">
                    {labels.resultGain.replace('{points}', points(outcome.gain))}
                </p>
                <p
                    className={[
                        'shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold tabular-nums',
                        medal ? '' : 'bg-surface-muted text-foreground',
                    ].join(' ')}
                    style={medal}
                >
                    {place}
                </p>
            </div>
            {status ? (
                <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-2.5 text-sm font-medium text-success">
                    {status.up ? (
                        <span aria-hidden className="text-xs">
                            ▲
                        </span>
                    ) : null}
                    {status.text}
                </p>
            ) : null}
            {outcome.capReached ? (
                <p className="mt-1.5 text-xs text-muted">{labels.resultCapReached}</p>
            ) : null}
        </section>
    );
}

export async function RatingGameResult(props: RatingGameResultProps) {
    const outcome = await loadOutcome(props);

    if (outcome.kind === 'none') {
        return null;
    }

    return (
        <RatingGameResultView
            outcome={outcome}
            locale={props.locale}
            labels={props.dictionary.leaderboard}
        />
    );
}
