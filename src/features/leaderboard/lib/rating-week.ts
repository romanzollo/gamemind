/**
 * Окна периода для «очков недели» (DECISIONS → Weekly rating points).
 *
 * Неделя календарная по Москве: понедельник 00:00 — воскресенье 23:59:59 МСК.
 * Москва живёт в UTC+3 без перехода на летнее время (с 2014 года), поэтому
 * границу считаем сдвигом на 3 часа — без Intl и без зависимости от TZ
 * сервера. В SQL дни режутся `AT TIME ZONE 'Europe/Moscow'` — это та же шкала.
 *
 * Чистые функции (Date → Date): границы передаются в pg параметрами
 * и покрываются unit-тестами без Neon.
 */

/** Период таблицы очков. `all` — сумма за всю историю (зал славы). */
export type RatingPeriod = 'week' | 'lastWeek' | 'all';

/** Полуинтервал `[from, to)` по `QuizResult.completedAt`; null = без границы. */
export type RatingPeriodWindow = {
    from: Date | null;
    to: Date | null;
};

/**
 * Потолок очков рейтинга игрока за один московский день.
 * Против ботов и массовых кликов наугад, а не чтобы урезать живых игроков:
 * выше самого активного реального дня на проде (544 очка за 36 игр, 5 ноя).
 * Меняем только с новой недели — правило посреди недели воспринимается как
 * нечестное.
 */
export const RATING_DAILY_POINTS_CAP = 600;

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Начало текущей недели (понедельник 00:00 МСК) как момент UTC. */
export function getMoscowWeekStart(now: Date = new Date()): Date {
    // «Часы на стене в Москве», записанные в UTC-поля.
    const moscowWall = new Date(now.getTime() + MOSCOW_OFFSET_MS);
    const daysSinceMonday = (moscowWall.getUTCDay() + 6) % 7;
    const mondayWall = Date.UTC(
        moscowWall.getUTCFullYear(),
        moscowWall.getUTCMonth(),
        moscowWall.getUTCDate() - daysSinceMonday,
    );

    return new Date(mondayWall - MOSCOW_OFFSET_MS);
}

/** Окно периода для SQL. */
export function getRatingPeriodWindow(
    period: RatingPeriod,
    now: Date = new Date(),
): RatingPeriodWindow {
    if (period === 'all') {
        return { from: null, to: null };
    }

    const weekStart = getMoscowWeekStart(now);

    if (period === 'lastWeek') {
        return {
            from: new Date(weekStart.getTime() - WEEK_MS),
            to: weekStart,
        };
    }

    return { from: weekStart, to: null };
}

/** Момент сброса текущей недели (следующий понедельник 00:00 МСК). */
export function getNextMoscowWeekStart(now: Date = new Date()): Date {
    return new Date(getMoscowWeekStart(now).getTime() + WEEK_MS);
}
