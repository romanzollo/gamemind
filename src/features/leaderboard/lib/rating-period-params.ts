/**
 * URL страницы рейтинга: единственный параметр — период.
 *
 * `?period=last` — прошлая неделя, `?period=all` — всё время, иначе (нет
 * параметра, мусор, старые `?mode=` / `?difficulty=` из прежних досок) —
 * текущая неделя. Старые ссылки не ломаются: лишние параметры молча
 * игнорируем (DECISIONS → Weekly rating points).
 */

import type { Locale } from '@/shared/i18n';

import type { RatingPeriod } from './rating-week';

const PERIOD_PARAM_VALUE: Record<RatingPeriod, string | null> = {
    week: null,
    lastWeek: 'last',
    all: 'all',
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

/** Период из search params страницы `/leaderboard`. */
export function parseRatingPeriod(
    searchParams: Record<string, string | string[] | undefined>,
): RatingPeriod {
    const raw = firstParam(searchParams.period);

    if (raw === 'last') {
        return 'lastWeek';
    }

    if (raw === 'all') {
        return 'all';
    }

    return 'week';
}

/** Ссылка на рейтинг с периодом; текущая неделя — без параметра. */
export function buildRatingHref(locale: Locale, period: RatingPeriod): string {
    const value = PERIOD_PARAM_VALUE[period];

    return value
        ? `/${locale}/leaderboard?period=${value}`
        : `/${locale}/leaderboard`;
}
