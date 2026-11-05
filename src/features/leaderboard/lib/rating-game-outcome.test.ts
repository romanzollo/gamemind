import { describe, expect, it } from 'vitest';

import type { RatingPointsStanding } from '@/entities/quiz-result/rating-points.repository';

import { resolveRatingGameOutcome, type RatingGameInput } from './rating-game-outcome';

function standing(rank: number, points: number, totalPlayers = 12): RatingPointsStanding {
    return {
        rank,
        points,
        totalPlayers,
        userId: 'u1',
        username: 'u',
        image: null,
        games: 1,
        byMode: { classic: points, blitz: 0, daily: 0, survival: 0 },
        pointsAbove: null,
        pointsBelow: null,
    };
}

const BASE: RatingGameInput = {
    contribution: {
        inPeriod: true,
        before: standing(6, 58),
        after: standing(4, 79),
    },
    score: 21,
    isTopicGame: false,
    isGuest: false,
    survivalClockOk: null,
    isSurvival: false,
};

describe('resolveRatingGameOutcome', () => {
    it('gain, new place and places climbed', () => {
        expect(resolveRatingGameOutcome(BASE)).toEqual({
            kind: 'gain',
            gain: 21,
            place: 4,
            total: 12,
            movedUp: 2,
            newEntry: false,
            capReached: false,
            lead: null,
        });
    });

    it('first place: lead over second', () => {
        const leader = { ...standing(1, 121), pointsBelow: 96 };
        const outcome = resolveRatingGameOutcome({
            ...BASE,
            contribution: { inPeriod: true, before: standing(1, 100), after: leader },
        });

        expect(outcome).toMatchObject({ kind: 'gain', lead: 25, movedUp: null });
    });

    it('alone on the board: lead equals own points', () => {
        const outcome = resolveRatingGameOutcome({
            ...BASE,
            contribution: { inPeriod: true, before: null, after: standing(1, 21, 1) },
        });

        expect(outcome).toMatchObject({ kind: 'gain', lead: 21, newEntry: true });
    });

    it('first points of the week: new entry, no climb', () => {
        const outcome = resolveRatingGameOutcome({
            ...BASE,
            contribution: { inPeriod: true, before: null, after: standing(9, 21) },
        });

        expect(outcome).toMatchObject({ kind: 'gain', newEntry: true, movedUp: null });
    });

    it('same place: no climb line', () => {
        const outcome = resolveRatingGameOutcome({
            ...BASE,
            contribution: { inPeriod: true, before: standing(1, 100), after: standing(1, 121) },
        });

        expect(outcome).toMatchObject({ kind: 'gain', movedUp: null });
    });

    it('daily cap cut part of the game', () => {
        const outcome = resolveRatingGameOutcome({
            ...BASE,
            contribution: { inPeriod: true, before: standing(2, 588), after: standing(1, 600) },
        });

        expect(outcome).toMatchObject({ kind: 'gain', gain: 12, capReached: true });
    });

    it('cap already reached: capped, not +0', () => {
        expect(
            resolveRatingGameOutcome({
                ...BASE,
                contribution: { inPeriod: true, before: standing(1, 600), after: standing(1, 600) },
            }),
        ).toEqual({ kind: 'capped' });
    });

    it('player hidden from ratings (test account): nothing, not «cap reached»', () => {
        expect(
            resolveRatingGameOutcome({
                ...BASE,
                contribution: { inPeriod: true, before: null, after: null },
            }),
        ).toEqual({ kind: 'none' });
    });

    it('zero score: nothing', () => {
        expect(
            resolveRatingGameOutcome({
                ...BASE,
                score: 0,
                contribution: { inPeriod: true, before: standing(4, 79), after: standing(4, 79) },
            }),
        ).toEqual({ kind: 'none' });
    });

    it('topic game: honest note, even for an old result', () => {
        expect(
            resolveRatingGameOutcome({
                ...BASE,
                isTopicGame: true,
                contribution: { inPeriod: false, before: null, after: null },
            }),
        ).toEqual({ kind: 'topic' });
    });

    it('guest, old game, failed load, bad Survival clock: nothing', () => {
        expect(resolveRatingGameOutcome({ ...BASE, isGuest: true })).toEqual({ kind: 'none' });
        expect(
            resolveRatingGameOutcome({
                ...BASE,
                contribution: { inPeriod: false, before: null, after: null },
            }),
        ).toEqual({ kind: 'none' });
        expect(resolveRatingGameOutcome({ ...BASE, contribution: null })).toEqual({ kind: 'none' });
        expect(
            resolveRatingGameOutcome({ ...BASE, isSurvival: true, survivalClockOk: false }),
        ).toEqual({ kind: 'none' });
    });
});
