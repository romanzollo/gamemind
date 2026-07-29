/**
 * Unit-тесты ключа календарного дня Daily Challenge (Moscow).
 *
 * Pure Intl — без Neon. Фиксируем, что около полуночи UTC день
 * может отличаться от Moscow (типичная ловушка toISOString().slice).
 */

import { describe, expect, it } from 'vitest';

import { getMoscowDateKey } from './get-moscow-date-key';

describe('getMoscowDateKey', () => {
    it('formats a midday UTC instant as YYYY-MM-DD in Moscow', () => {
        // 2026-07-29 12:00 UTC = 15:00 MSK → тот же календарный день
        const key = getMoscowDateKey(new Date('2026-07-29T12:00:00.000Z'));

        expect(key).toBe('2026-07-29');
    });

    it('uses the next Moscow calendar day after UTC midnight when MSK is already next day', () => {
        // 2026-07-29 22:00 UTC = 2026-07-30 01:00 MSK
        const key = getMoscowDateKey(new Date('2026-07-29T22:00:00.000Z'));

        expect(key).toBe('2026-07-30');
    });

    it('stays on the previous Moscow day late evening MSK while UTC already rolled', () => {
        // 2026-07-29 21:00 UTC = 2026-07-30 00:00 MSK → уже 30-е в Москве
        // Контроль «раннего» утра MSK: 2026-07-29 20:59 UTC = 23:59 MSK 29-го
        const still29 = getMoscowDateKey(new Date('2026-07-29T20:59:00.000Z'));
        const already30 = getMoscowDateKey(new Date('2026-07-29T21:00:00.000Z'));

        expect(still29).toBe('2026-07-29');
        expect(already30).toBe('2026-07-30');
    });
});
