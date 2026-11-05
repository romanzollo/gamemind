/**
 * Подписи периода рейтинга: «2–8 ноября», «итоги через 3 д 14 ч».
 *
 * Даты — по Москве (неделя рейтинга московская), язык — локаль страницы.
 * Чистые функции от `now`: страница динамическая (сессия), значения
 * считаются на запросе и покрываются unit-тестами без часов браузера.
 */

import type { Locale } from '@/shared/i18n';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const rangeFormatters = new Map<Locale, Intl.DateTimeFormat>();

function getRangeFormatter(locale: Locale): Intl.DateTimeFormat {
    let formatter = rangeFormatters.get(locale);

    if (!formatter) {
        formatter = new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'long',
            timeZone: 'Europe/Moscow',
        });
        rangeFormatters.set(locale, formatter);
    }

    return formatter;
}

/**
 * Диапазон недели от понедельника `weekStart` до воскресенья включительно:
 * «2–8 ноября», «26 октября – 1 ноября», «November 2 – 8».
 */
export function formatWeekRange(locale: Locale, weekStart: Date): string {
    const sunday = new Date(weekStart.getTime() + 6 * DAY_MS);

    return getRangeFormatter(locale).formatRange(weekStart, sunday);
}

/**
 * Остаток до сброса: «3 д 14 ч»; меньше суток — только часы; меньше часа —
 * «1 ч», чтобы не показывать «0 ч» до самого сброса.
 */
export function formatTimeLeft(
    msLeft: number,
    units: { daysShort: string; hoursShort: string },
): string {
    const safeMs = Math.max(msLeft, 0);
    const days = Math.floor(safeMs / DAY_MS);
    const hours = Math.max(
        Math.floor((safeMs - days * DAY_MS) / HOUR_MS),
        days === 0 ? 1 : 0,
    );
    const hoursText = units.hoursShort.replace('{n}', String(hours));

    if (days === 0) {
        return hoursText;
    }

    const daysText = units.daysShort.replace('{n}', String(days));

    return hours === 0 ? daysText : `${daysText} ${hoursText}`;
}
