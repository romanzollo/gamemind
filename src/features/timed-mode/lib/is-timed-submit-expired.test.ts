/**
 * Unit-тесты Timed submit deadline gate.
 *
 * Зачем: anti-cheat правило (endsAt + grace) должно быть зафиксировано тестом,
 * иначе рефактор action легко «съест» grace или начнёт доверять клиенту.
 */

import { describe, expect, it } from 'vitest';

import { isTimedSubmitExpired } from './is-timed-submit-expired';

describe('isTimedSubmitExpired', () => {
    const endsAt = '2026-07-31T12:00:00.000Z';
    const endsAtMs = Date.parse(endsAt);

    it('returns false when timedEndsAt is null (classic/daily)', () => {
        expect(isTimedSubmitExpired(null, endsAtMs + 60_000, 3)).toBe(false);
    });

    it('returns false before deadline', () => {
        expect(isTimedSubmitExpired(endsAt, endsAtMs - 1_000, 3)).toBe(false);
    });

    it('returns false within grace window after deadline', () => {
        expect(isTimedSubmitExpired(endsAt, endsAtMs + 2_999, 3)).toBe(false);
    });

    it('returns true after grace window', () => {
        expect(isTimedSubmitExpired(endsAt, endsAtMs + 3_001, 3)).toBe(true);
    });

    it('returns true for invalid timedEndsAt string', () => {
        expect(isTimedSubmitExpired('not-a-date', endsAtMs, 3)).toBe(true);
    });
});
