import { describe, expect, it } from 'vitest';

import { computeRoomAwards, getRoomGoal } from './room-awards';
import { computeRoomStandings } from './room-scoring';

const answers = [
    // Вопрос 1: c быстрее всех, a — медленно, b мимо.
    { playerId: 'a', position: 0, isCorrect: true, points: 600, elapsedMs: 8_000 },
    { playerId: 'b', position: 0, isCorrect: false, points: 0, elapsedMs: 2_000 },
    { playerId: 'c', position: 0, isCorrect: true, points: 950, elapsedMs: 1_000 },
    // Вопрос 2: b вырывается вперёд, c мимо.
    { playerId: 'a', position: 1, isCorrect: true, points: 700, elapsedMs: 6_000 },
    { playerId: 'b', position: 1, isCorrect: true, points: 990, elapsedMs: 600 },
    { playerId: 'c', position: 1, isCorrect: false, points: 0, elapsedMs: 3_000 },
    // Вопрос 3: b снова, a тоже.
    { playerId: 'a', position: 2, isCorrect: true, points: 650, elapsedMs: 7_000 },
    { playerId: 'b', position: 2, isCorrect: true, points: 980, elapsedMs: 800 },
];

describe('room awards', () => {
    it('picks fastest, then sharpshooter and climb among the rest', () => {
        // b — самый быстрый и сильнее всех поднялся, но награда у него одна;
        // «Рывок» больше никто не заслужил (c упал, a не поднялся) — его нет.
        expect(computeRoomAwards(['a', 'b', 'c'], answers, 3)).toEqual([
            { kind: 'fastest', playerId: 'b', averageMs: 700 },
            { kind: 'sniper', playerId: 'a', correct: 3 },
        ]);
    });

    it('gives each award to a different player when one dominates', () => {
        const solo = [
            { playerId: 'a', position: 0, isCorrect: false, points: 0, elapsedMs: 1_000 },
            { playerId: 'b', position: 0, isCorrect: true, points: 900, elapsedMs: 2_000 },
            { playerId: 'c', position: 0, isCorrect: true, points: 700, elapsedMs: 6_000 },
            { playerId: 'a', position: 1, isCorrect: true, points: 990, elapsedMs: 500 },
            { playerId: 'b', position: 1, isCorrect: false, points: 0, elapsedMs: 4_000 },
            { playerId: 'c', position: 1, isCorrect: true, points: 600, elapsedMs: 8_000 },
        ];
        const awards = computeRoomAwards(['a', 'b', 'c'], solo, 2);
        expect(new Set(awards.map((award) => award.playerId)).size).toBe(awards.length);
        expect(awards.map((award) => [award.kind, award.playerId])).toEqual([
            ['fastest', 'a'],
            ['sniper', 'c'],
        ]);
    });

    it('gives nothing when nobody earned it', () => {
        const misses = [
            { playerId: 'a', position: 0, isCorrect: false, points: 0, elapsedMs: 1_000 },
            { playerId: 'b', position: 0, isCorrect: false, points: 0, elapsedMs: 1_000 },
        ];
        expect(computeRoomAwards(['a', 'b'], misses, 1)).toEqual([]);
        expect(computeRoomAwards(['a'], answers, 3)).toEqual([]);
    });
});

describe('room goal', () => {
    const standings = computeRoomStandings(['a', 'b', 'c'], answers, 2);

    it('tells the leader the lead and others the gap to the next place', () => {
        // После 2 вопросов: a 1300, b 990, c 950.
        expect(getRoomGoal(standings, 'a')).toEqual({ kind: 'lead', ahead: 310 });
        expect(getRoomGoal(standings, 'b')).toEqual({ kind: 'chase', targetRank: 1, behind: 310 });
        expect(getRoomGoal(standings, 'c')).toEqual({ kind: 'chase', targetRank: 2, behind: 40 });
    });

    it('stays quiet before anyone scores or alone', () => {
        expect(getRoomGoal(computeRoomStandings(['a', 'b'], [], 0), 'a')).toBeNull();
        expect(getRoomGoal(computeRoomStandings(['a'], answers, 2), 'a')).toBeNull();
    });
});
