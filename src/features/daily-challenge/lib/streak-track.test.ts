import { describe, expect, it } from 'vitest';

import { streakTrackFill } from './streak-track';

const MILESTONES = [3, 7, 30];

describe('streakTrackFill', () => {
    it('is empty without a streak', () => {
        expect(streakTrackFill(0, MILESTONES)).toBe(0);
        expect(streakTrackFill(-2, MILESTONES)).toBe(0);
    });

    it('puts milestones at equal steps', () => {
        expect(streakTrackFill(3, MILESTONES)).toBeCloseTo(1 / 3);
        expect(streakTrackFill(7, MILESTONES)).toBeCloseTo(2 / 3);
        expect(streakTrackFill(30, MILESTONES)).toBe(1);
    });

    it('fills linearly inside a segment', () => {
        expect(streakTrackFill(5, MILESTONES)).toBeCloseTo(1 / 3 + (2 / 4) / 3);
        expect(streakTrackFill(1, MILESTONES)).toBeCloseTo(1 / 9);
    });

    it('stays full past the last milestone and empty without milestones', () => {
        expect(streakTrackFill(45, MILESTONES)).toBe(1);
        expect(streakTrackFill(5, [])).toBe(0);
    });
});
