import { describe, expect, it } from 'vitest';

import {
    generateRoomCode,
    normalizeRoomCode,
    ROOM_CODE_ALPHABET,
} from './room-code';
import {
    dedupeRoomNickname,
    generateRoomNickname,
    nicknameFromUsername,
    normalizeRoomNickname,
} from './room-nickname';
import { orderOptionsForPlayer } from './room-option-order';
import { getRoomMixedSplit, pickRoomQuestionIds } from './room-pick';
import { DEFAULT_ROOM_SETTINGS, parseRoomSettings } from './room-rules';
import {
    buildRoomSchedule,
    countRevealedQuestions,
    getRoomEndsAt,
    getRoomPhase,
    introMsForText,
    isAnswerWindowOpen,
    shiftScheduleAfterEarlyClose,
} from './room-schedule';
import { computeRoomStandings, scoreRoomAnswer } from './room-scoring';

describe('room code', () => {
    it('generates 4 signs from the alphabet without look-alikes', () => {
        for (let i = 0; i < 200; i += 1) {
            const code = generateRoomCode();
            expect(code).toHaveLength(4);
            for (const sign of code) {
                expect(ROOM_CODE_ALPHABET).toContain(sign);
            }
        }
        expect(ROOM_CODE_ALPHABET).not.toMatch(/[01ILO]/);
    });

    it('normalizes case and spaces, rejects unknown signs', () => {
        expect(normalizeRoomCode(' k7qf ')).toBe('K7QF');
        expect(normalizeRoomCode('K7-QF')).toBe('K7QF');
        expect(normalizeRoomCode('K0QF')).toBeNull();
        expect(normalizeRoomCode('KOQF')).toBeNull();
        expect(normalizeRoomCode('K7Q')).toBeNull();
        expect(normalizeRoomCode(42)).toBeNull();
    });
});

describe('room settings', () => {
    it('accepts the defaults and allowed values only', () => {
        expect(parseRoomSettings(DEFAULT_ROOM_SETTINGS)).toEqual(DEFAULT_ROOM_SETTINGS);
        expect(
            parseRoomSettings({ ...DEFAULT_ROOM_SETTINGS, questionCount: 20, answerSeconds: 30 }),
        ).not.toBeNull();
        expect(parseRoomSettings({ ...DEFAULT_ROOM_SETTINGS, questionCount: 12 })).toBeNull();
        expect(parseRoomSettings({ ...DEFAULT_ROOM_SETTINGS, answerSeconds: 5 })).toBeNull();
        expect(parseRoomSettings({ ...DEFAULT_ROOM_SETTINGS, difficulty: 'NIGHTMARE' })).toBeNull();
        expect(parseRoomSettings(null)).toBeNull();
    });
});

describe('room schedule', () => {
    const start = 1_000_000;
    const schedule = buildRoomSchedule(start, [40, 200], 15);

    it('gives the intro 3–6 s by text length', () => {
        expect(introMsForText(0)).toBe(3_000);
        expect(introMsForText(50)).toBe(3_500);
        expect(introMsForText(500)).toBe(6_000);
    });

    it('lays out countdown → intro → answer → reveal', () => {
        expect(schedule[0]).toEqual({
            position: 0,
            introAt: start + 5_000,
            openAt: start + 5_000 + 3_100,
            closeAt: start + 5_000 + 3_100 + 15_000,
        });
        expect(schedule[1]!.introAt).toBe(schedule[0]!.closeAt + 7_000);
        expect(getRoomEndsAt(schedule)).toBe(schedule[1]!.closeAt + 7_000);
    });

    it('tells the phase at any moment', () => {
        const [q0, q1] = schedule as [(typeof schedule)[0], (typeof schedule)[0]];
        expect(getRoomPhase(schedule, start)).toEqual({ kind: 'countdown', endsAt: q0.introAt });
        expect(getRoomPhase(schedule, q0.introAt)).toMatchObject({ kind: 'intro', position: 0 });
        expect(getRoomPhase(schedule, q0.openAt)).toMatchObject({ kind: 'answer', position: 0 });
        expect(getRoomPhase(schedule, q0.closeAt)).toEqual({
            kind: 'reveal',
            position: 0,
            endsAt: q1.introAt,
        });
        expect(getRoomPhase(schedule, q1.closeAt + 6_999)).toMatchObject({
            kind: 'reveal',
            position: 1,
        });
        expect(getRoomPhase(schedule, q1.closeAt + 7_000)).toEqual({ kind: 'finished' });
        expect(countRevealedQuestions(schedule, q0.closeAt)).toBe(1);
    });

    it('accepts answers from open to close plus grace', () => {
        const q0 = schedule[0]!;
        expect(isAnswerWindowOpen(q0, q0.openAt - 1)).toBe(false);
        expect(isAnswerWindowOpen(q0, q0.openAt)).toBe(true);
        expect(isAnswerWindowOpen(q0, q0.closeAt + 1_500)).toBe(true);
        expect(isAnswerWindowOpen(q0, q0.closeAt + 1_501)).toBe(false);
    });

    it('moves later questions up after an early close', () => {
        const q0 = schedule[0]!;
        const shifted = shiftScheduleAfterEarlyClose(schedule, 0, q0.openAt + 5_000);
        expect(shifted[0]!.closeAt).toBe(q0.openAt + 5_000);
        expect(shifted[1]!.introAt).toBe(schedule[1]!.introAt - 10_000);
        expect(shifted[1]!.closeAt).toBe(schedule[1]!.closeAt - 10_000);
        // Закрыть «позже» нельзя — расписание не меняется.
        expect(shiftScheduleAfterEarlyClose(schedule, 0, q0.closeAt + 1)).toEqual(schedule);
    });
});

describe('room scoring', () => {
    const base = { isCorrect: true, answerMs: 20_000, speedScoring: true };

    it('pays 1000 → 500 by speed like Kahoot', () => {
        expect(scoreRoomAnswer({ ...base, elapsedMs: 300 })).toBe(1000);
        expect(scoreRoomAnswer({ ...base, elapsedMs: 2_000 })).toBe(950);
        expect(scoreRoomAnswer({ ...base, elapsedMs: 10_000 })).toBe(750);
        expect(scoreRoomAnswer({ ...base, elapsedMs: 20_000 })).toBe(500);
        // Ответ в запасе на сеть — как в последнюю секунду.
        expect(scoreRoomAnswer({ ...base, elapsedMs: 21_000 })).toBe(500);
    });

    it('pays 0 for a miss and 1000 flat without speed points', () => {
        expect(scoreRoomAnswer({ ...base, isCorrect: false, elapsedMs: 100 })).toBe(0);
        expect(scoreRoomAnswer({ ...base, speedScoring: false, elapsedMs: 19_000 })).toBe(1000);
    });

    it('ranks by score, then correct count, then speed; ties share a place', () => {
        const answers = [
            { playerId: 'a', position: 0, isCorrect: true, points: 900, elapsedMs: 2_000 },
            { playerId: 'b', position: 0, isCorrect: true, points: 900, elapsedMs: 2_000 },
            { playerId: 'c', position: 0, isCorrect: false, points: 0, elapsedMs: 1_000 },
            { playerId: 'a', position: 1, isCorrect: false, points: 0, elapsedMs: 3_000 },
            { playerId: 'b', position: 1, isCorrect: true, points: 800, elapsedMs: 4_000 },
            { playerId: 'c', position: 1, isCorrect: true, points: 950, elapsedMs: 1_000 },
        ];

        const afterFirst = computeRoomStandings(['a', 'b', 'c'], answers, 1);
        expect(afterFirst.map((row) => [row.playerId, row.rank])).toEqual([
            ['a', 1],
            ['b', 1],
            ['c', 3],
        ]);

        const afterSecond = computeRoomStandings(['a', 'b', 'c'], answers, 2);
        expect(afterSecond.map((row) => [row.playerId, row.rank, row.previousRank])).toEqual([
            ['b', 1, 1],
            ['c', 2, 3],
            ['a', 3, 1],
        ]);
        const b = afterSecond.find((row) => row.playerId === 'b')!;
        expect(b).toMatchObject({ score: 1700, correctCount: 2, lastPoints: 800, streak: 2 });
        expect(afterSecond.find((row) => row.playerId === 'a')!.streak).toBe(0);
    });

    it('ignores answers to questions that are not revealed yet', () => {
        const answers = [
            { playerId: 'a', position: 0, isCorrect: true, points: 1000, elapsedMs: 100 },
        ];
        expect(computeRoomStandings(['a', 'b'], answers, 0)).toMatchObject([
            { playerId: 'a', score: 0, rank: 1, previousRank: null },
            { playerId: 'b', score: 0, rank: 1, previousRank: null },
        ]);
    });
});

describe('room nickname', () => {
    it('trims, collapses spaces and checks length and signs', () => {
        expect(normalizeRoomNickname('  Ловкий   Гумба ')).toBe('Ловкий Гумба');
        expect(normalizeRoomNickname('a')).toBeNull();
        expect(normalizeRoomNickname('x'.repeat(21))).toBeNull();
        expect(normalizeRoomNickname('<script>')).toBeNull();
        expect(normalizeRoomNickname('_dash')).toBeNull();
        expect(normalizeRoomNickname('Player_1.2-3')).toBe('Player_1.2-3');
    });

    it('starts from the username, cut to the limit', () => {
        expect(nicknameFromUsername('roman_z')).toBe('roman_z');
        expect(nicknameFromUsername('a_very_long_username_123')).toHaveLength(20);
    });

    it('adds a number when the name is taken', () => {
        expect(dedupeRoomNickname('Рома', ['рома'])).toBe('Рома 2');
        expect(dedupeRoomNickname('Рома', ['Рома', 'Рома 2'])).toBe('Рома 3');
        expect(dedupeRoomNickname('x'.repeat(20), ['x'.repeat(20)])).toBe(`${'x'.repeat(18)} 2`);
        expect(dedupeRoomNickname('Аня', ['Рома'])).toBe('Аня');
    });

    it('builds a guest name from the word lists', () => {
        const words = { adjectives: ['Ловкий'], nouns: ['Гумба'] };
        expect(generateRoomNickname(words, () => 0)).toBe('Ловкий Гумба');
    });
});

describe('room option order', () => {
    const options = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }];

    it('is stable for a player and differs between players', () => {
        const first = orderOptionsForPlayer(options, 'room1', 'p1', 0);
        expect(orderOptionsForPlayer([...options].reverse(), 'room1', 'p1', 0)).toEqual(first);

        const orders = new Set(
            ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((player) =>
                orderOptionsForPlayer(options, 'room1', player, 0)
                    .map((option) => option.key)
                    .join(''),
            ),
        );
        expect(orders.size).toBeGreaterThan(1);
    });
});

describe('room pick', () => {
    const pool = [
        ...Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, difficulty: 'EASY' as const })),
        ...Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, difficulty: 'MEDIUM' as const })),
        ...Array.from({ length: 3 }, (_, i) => ({ id: `h${i}`, difficulty: 'HARD' as const })),
    ];

    it('splits a mix into thirds, easy first', () => {
        expect(getRoomMixedSplit(5)).toEqual({ EASY: 2, MEDIUM: 2, HARD: 1 });
        expect(getRoomMixedSplit(10)).toEqual({ EASY: 4, MEDIUM: 3, HARD: 3 });
        expect(getRoomMixedSplit(20)).toEqual({ EASY: 7, MEDIUM: 7, HARD: 6 });
    });

    it('picks distinct ids by difficulty and refuses a thin pool', () => {
        const mix = pickRoomQuestionIds(pool, { difficulty: 'MIXED', questionCount: 10 })!;
        expect(mix).toHaveLength(10);
        expect(new Set(mix).size).toBe(10);
        expect(mix.filter((id) => id.startsWith('h'))).toHaveLength(3);

        expect(pickRoomQuestionIds(pool, { difficulty: 'EASY', questionCount: 5 })).toHaveLength(5);
        expect(pickRoomQuestionIds(pool, { difficulty: 'HARD', questionCount: 5 })).toBeNull();
        expect(pickRoomQuestionIds(pool, { difficulty: 'MIXED', questionCount: 15 })).toBeNull();
    });
});
