/**
 * Порядок плиток профиля: новые (по ссылке из тоста) → закрытые → открытые.
 */

import { describe, expect, it } from 'vitest';

import type { AchievementProgressItem } from '@/features/achievements/types';

import { sortAchievementItemsForProfile } from './sort-achievement-items';

function item(
    code: AchievementProgressItem['code'],
    unlocked: boolean,
): AchievementProgressItem {
    return {
        code,
        unlockedAt: unlocked ? new Date('2026-10-30T10:00:00Z') : null,
        criteriaCurrent: null,
        criteriaTarget: null,
    };
}

const catalogOrder: AchievementProgressItem[] = [
    item('FIRST_QUIZ', true),
    item('QUIZZES_5', false),
    item('PERFECT_QUIZ', true),
    item('DAILY_COMPLETE', false),
    item('BLITZ_PERFECT_FAST', true),
];

const codes = (items: AchievementProgressItem[]) => items.map((x) => x.code);

describe('sortAchievementItemsForProfile', () => {
    it('puts locked first and keeps catalog order inside groups', () => {
        expect(codes(sortAchievementItemsForProfile(catalogOrder))).toEqual([
            'QUIZZES_5',
            'DAILY_COMPLETE',
            'FIRST_QUIZ',
            'PERFECT_QUIZ',
            'BLITZ_PERFECT_FAST',
        ]);
    });

    it('orders locked ones by how close they are to unlocking', () => {
        const withProgress: AchievementProgressItem[] = [
            { ...item('QUIZZES_5', false), criteriaCurrent: 1, criteriaTarget: 5 },
            { ...item('DAILY_COMPLETE', false), criteriaCurrent: 0, criteriaTarget: 1 },
            { ...item('PERFECT_QUIZ', false), criteriaCurrent: 2, criteriaTarget: 3 },
            item('FIRST_QUIZ', true),
        ];

        expect(codes(sortAchievementItemsForProfile(withProgress))).toEqual([
            'PERFECT_QUIZ',
            'QUIZZES_5',
            'DAILY_COMPLETE',
            'FIRST_QUIZ',
        ]);
    });

    it('moves highlighted (just unlocked) codes to the very top', () => {
        expect(
            codes(
                sortAchievementItemsForProfile(catalogOrder, [
                    'BLITZ_PERFECT_FAST',
                    'FIRST_QUIZ',
                ]),
            ),
        ).toEqual([
            'FIRST_QUIZ',
            'BLITZ_PERFECT_FAST',
            'QUIZZES_5',
            'DAILY_COMPLETE',
            'PERFECT_QUIZ',
        ]);
    });

    it('ignores highlighted codes that are still locked', () => {
        expect(
            codes(sortAchievementItemsForProfile(catalogOrder, ['QUIZZES_5'])),
        ).toEqual(codes(sortAchievementItemsForProfile(catalogOrder)));
    });

    it('does not mutate the input array', () => {
        const input = [...catalogOrder];
        sortAchievementItemsForProfile(input, ['PERFECT_QUIZ']);
        expect(codes(input)).toEqual(codes(catalogOrder));
    });
});
