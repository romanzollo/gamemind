import { describe, expect, it } from 'vitest';

import type { ChallengeSourceSession } from '@/entities/friend-challenge/friend-challenge.repository';

import {
    getChallengeMaxScore,
    getChallengeOutcome,
    isChallengeableSession,
    orderMarks,
} from './challenge-rules';

const classic: ChallengeSourceSession = {
    status: 'COMPLETED',
    difficulty: 'EASY',
    poolKind: 'SINGLE',
    questionCount: 3,
    isDaily: false,
    isTimed: false,
    isSurvival: false,
    hasTopic: false,
    isFriendChallenge: false,
    score: 2,
    correctCount: 2,
    marks: [
        { questionId: 'q1', isCorrect: true },
        { questionId: 'q2', isCorrect: true },
        { questionId: 'q3', isCorrect: false },
    ],
};

describe('isChallengeableSession', () => {
    it('accepts a finished Classic game on the whole bank', () => {
        expect(isChallengeableSession(classic)).toBe(true);
    });

    it('rejects other modes, topics, challenges and unfinished games', () => {
        expect(isChallengeableSession({ ...classic, isDaily: true })).toBe(false);
        expect(isChallengeableSession({ ...classic, isTimed: true })).toBe(false);
        expect(isChallengeableSession({ ...classic, isSurvival: true })).toBe(false);
        expect(isChallengeableSession({ ...classic, hasTopic: true })).toBe(false);
        expect(isChallengeableSession({ ...classic, isFriendChallenge: true })).toBe(false);
        expect(isChallengeableSession({ ...classic, status: 'IN_PROGRESS' })).toBe(false);
    });

    it('rejects a game without a full review or with repeated questions', () => {
        expect(isChallengeableSession({ ...classic, marks: null })).toBe(false);
        expect(
            isChallengeableSession({ ...classic, marks: classic.marks?.slice(0, 2) ?? null }),
        ).toBe(false);
        expect(
            isChallengeableSession({
                ...classic,
                marks: [
                    { questionId: 'q1', isCorrect: true },
                    { questionId: 'q1', isCorrect: true },
                    { questionId: 'q3', isCorrect: false },
                ],
            }),
        ).toBe(false);
    });
});

describe('getChallengeOutcome', () => {
    it('compares points on the same questions', () => {
        expect(getChallengeOutcome(3, 2)).toBe('win');
        expect(getChallengeOutcome(2, 2)).toBe('draw');
        expect(getChallengeOutcome(1, 2)).toBe('loss');
    });
});

describe('getChallengeMaxScore', () => {
    it('weights a single difficulty like Classic', () => {
        expect(getChallengeMaxScore('SINGLE', 'EASY', 3)).toBe(3);
        expect(getChallengeMaxScore('SINGLE', 'HARD', 5)).toBe(15);
    });

    it('uses the Mix split for MIXED sets', () => {
        expect(getChallengeMaxScore('MIXED', null, 10)).not.toBeNull();
    });
});

describe('orderMarks', () => {
    it('follows the challenge order; a missing answer counts as wrong', () => {
        const answers = new Map([
            ['q3', true],
            ['q1', false],
        ]);
        expect(orderMarks(['q1', 'q2', 'q3'], answers)).toEqual([false, false, true]);
    });
});
