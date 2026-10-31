/**
 * Unit-тесты банка следующей волны Survival (pure, без Neon).
 */

import { describe, expect, it } from 'vitest';

import { SURVIVAL_MODE_MVP_RULES } from '@/features/survival-mode/types';

import { resolveSurvivalNextWaveBankSeconds } from './resolve-survival-next-wave-bank';

const MIN = SURVIVAL_MODE_MVP_RULES.minWaveStartBankSeconds;

describe('resolveSurvivalNextWaveBankSeconds', () => {
    it('ends the run when the wave ended on an empty bank, whatever the clock says', () => {
        // Прод, окт 2026: часы телефона спешили на ~2 с, сервер видел остаток 1 с.
        expect(
            resolveSurvivalNextWaveBankSeconds({
                reconstructedSeconds: 1,
                endedOnBank: true,
            }),
        ).toBe(0);
    });

    it('tops a small leftover up to the minimum start bank', () => {
        expect(
            resolveSurvivalNextWaveBankSeconds({
                reconstructedSeconds: 1,
                endedOnBank: false,
            }),
        ).toBe(MIN);
    });

    it('keeps a leftover that is already above the minimum', () => {
        expect(
            resolveSurvivalNextWaveBankSeconds({
                reconstructedSeconds: MIN + 7,
                endedOnBank: false,
            }),
        ).toBe(MIN + 7);
    });

    it('returns 0 for an empty or broken leftover', () => {
        expect(
            resolveSurvivalNextWaveBankSeconds({
                reconstructedSeconds: 0,
                endedOnBank: false,
            }),
        ).toBe(0);
        expect(
            resolveSurvivalNextWaveBankSeconds({
                reconstructedSeconds: Number.NaN,
                endedOnBank: false,
            }),
        ).toBe(0);
    });
});
