import { describe, expect, it } from 'vitest';

import {
    buildRatingBoardSql,
    buildRatingStandingSql,
    type RatingPointsFilters,
} from './rating-points.repository';

const WEEK: RatingPointsFilters = {
    from: new Date('2026-11-01T21:00:00.000Z'),
    to: null,
    mode: 'all',
    dailyCap: 600,
};

describe('buildRatingBoardSql', () => {
    it('all modes: Survival only with a valid clock, no topic games, hidden users out', () => {
        const { text } = buildRatingBoardSql(WEEK, 20);

        expect(text).toContain(
            '(s."survivalRunId" IS NULL OR s."survivalClockOk" IS TRUE)',
        );
        expect(text).toContain('s."topicTagId" IS NULL');
        expect(text).toContain('u."isGuest" = false');
        expect(text).toContain('u."isTestAccount" = false');
    });

    it('never reads snapshot or review JSON', () => {
        const { text } = buildRatingBoardSql(WEEK, 20);

        expect(text).not.toMatch(/snapshotData|reviewPayload|reviewSnapshot/);
    });

    it('passes the period start as a UTC ISO string, then the cap, then the limit', () => {
        const { text, values } = buildRatingBoardSql(WEEK, 20);

        expect(values).toEqual(['2026-11-01T21:00:00.000Z', 600, 20]);
        expect(text).toContain(
            `r."completedAt" >= ($1::timestamptz AT TIME ZONE 'UTC')`,
        );
        expect(text).toContain('LEAST(day_points, $2::int)');
        expect(text).toContain('LIMIT $3');
    });

    it('closed period adds an exclusive upper bound', () => {
        const { text, values } = buildRatingBoardSql(
            { ...WEEK, to: new Date('2026-11-08T21:00:00.000Z') },
            20,
        );

        expect(values.slice(0, 2)).toEqual([
            '2026-11-01T21:00:00.000Z',
            '2026-11-08T21:00:00.000Z',
        ]);
        expect(text).toContain(
            `r."completedAt" < ($2::timestamptz AT TIME ZONE 'UTC')`,
        );
    });

    it('all time has no date bounds', () => {
        const { text, values } = buildRatingBoardSql(
            { ...WEEK, from: null },
            20,
        );

        expect(values).toEqual([600, 20]);
        expect(text).not.toContain('timestamptz');
    });

    it('single mode reuses the board discriminators', () => {
        const { text } = buildRatingBoardSql({ ...WEEK, mode: 'blitz' }, 20);

        expect(text).toContain('s."timedEndsAt" IS NOT NULL');
        expect(text).toContain('s."dailyChallengeId" IS NULL');
        expect(text).not.toContain('s."survivalRunId" IS NULL OR');
    });

    it('Survival mode keeps only clock-verified waves', () => {
        const { text } = buildRatingBoardSql({ ...WEEK, mode: 'survival' }, 20);

        expect(text).toContain('s."survivalRunId" IS NOT NULL');
        expect(text).toContain('s."survivalClockOk" IS TRUE');
    });

    it('ties: earlier last scoring game first, then id', () => {
        const { text } = buildRatingBoardSql(WEEK, 20);

        expect(text).toContain(
            'ORDER BY pu.points DESC, pu.last_scored_at ASC, pu.user_id ASC',
        );
    });
});

describe('buildRatingStandingSql', () => {
    it('filters by the user id as the last parameter', () => {
        const { text, values } = buildRatingStandingSql(WEEK, 'user-1');

        expect(values.at(-1)).toBe('user-1');
        expect(text).toContain(`WHERE me.user_id = $${values.length}`);
        expect(text).toContain('above.rank = me.rank - 1');
    });
});
