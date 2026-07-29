/**
 * Календарный день Daily Challenge в Europe/Moscow.
 *
 * Зачем отдельная функция:
 * - «день» для RU-аудитории = по Москве, не UTC-дата из toISOString();
 * - чистая функция (Date → string) — легко покрыть unit-тестом без Neon;
 * - один формат `YYYY-MM-DD` для URL, seed pick и колонки DATE.
 *
 * Canon: DAILY_CHALLENGE_MVP_RULES.timezone; DECISIONS → Daily Challenge MVP.
 */

import { DAILY_CHALLENGE_MVP_RULES } from '@/features/daily-challenge/types';
import type { DailyChallengeDateKey } from '@/features/daily-challenge/types';

const MOSCOW_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_CHALLENGE_MVP_RULES.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/**
 * Возвращает `YYYY-MM-DD` для момента `now` в Europe/Moscow.
 * `en-CA` даёт ISO-подобный порядок года-месяца-дня.
 */
export function getMoscowDateKey(now: Date = new Date()): DailyChallengeDateKey {
    return MOSCOW_DATE_FORMATTER.format(now);
}
