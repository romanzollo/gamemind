import { describe, expect, it } from 'vitest';

import { enDictionary as en } from '@/shared/i18n/dictionaries/en';
import { ruDictionary as ru } from '@/shared/i18n/dictionaries/ru';

import { computeRoomAwards, getRoomGoal } from './room-awards';
import { generateRoomNickname, normalizeRoomNickname } from './room-nickname';
import { computeRoomStandings, type RoomScoredAnswer } from './room-scoring';

const ANSWER_MS = 10_000;

function answer(
    playerId: string,
    position: number,
    isCorrect: boolean,
    elapsedMs: number,
    points = isCorrect ? Math.round(1000 * (1 - elapsedMs / ANSWER_MS / 2)) : 0,
): RoomScoredAnswer {
    return { playerId, position, isCorrect, points, elapsedMs };
}

describe('room awards', () => {
    it('gives each player at most one award and the last unawarded one «brave»', () => {
        const answers = [
            // a — быстрый и точный; b — медленный, но последний в игре знал ответ; c — мимо.
            answer('a', 0, true, 1_000), answer('b', 0, true, 9_000), answer('c', 0, false, 3_000),
            answer('a', 1, true, 1_200), answer('b', 1, false, 8_000), answer('c', 1, false, 2_500),
            answer('a', 2, true, 900), answer('b', 2, true, 8_500), answer('c', 2, false, 2_000),
            answer('a', 3, false, 1_500), answer('b', 3, true, 8_800), answer('c', 3, false, 2_200),
        ];
        const awards = computeRoomAwards(['a', 'b', 'c'], answers, 4, ANSWER_MS);

        expect(new Set(awards.map((award) => award.playerId)).size).toBe(awards.length);
        expect(awards.map((award) => [award.kind, award.playerId])).toEqual([
            ['fastest', 'a'],
            ['sniper', 'b'],
            ['brave', 'c'],
        ]);
    });

    it('finds streak, solo, clutch and trigger for different players', () => {
        const answers = [
            // q0: только d прав (знаток), e жмёт первым.
            answer('a', 0, false, 3_000), answer('b', 0, false, 4_000), answer('d', 0, true, 5_000), answer('e', 0, false, 200),
            // q1–q3: a прав трижды подряд, e снова первый и мимо.
            answer('a', 1, true, 2_000), answer('b', 1, true, 8_000), answer('d', 1, false, 5_000), answer('e', 1, false, 300),
            answer('a', 2, true, 2_000), answer('b', 2, true, 8_500), answer('d', 2, false, 5_000), answer('e', 2, false, 300),
            answer('a', 3, true, 2_000), answer('b', 3, true, 9_000), answer('d', 3, false, 5_000), answer('e', 3, false, 300),
        ];
        const awards = computeRoomAwards(['a', 'b', 'd', 'e'], answers, 4, ANSWER_MS);
        const byKind = Object.fromEntries(awards.map((award) => [award.kind, award.playerId]));

        expect(byKind.fastest).toBe('a');
        // b — самый точный из оставшихся (3 верных).
        expect(byKind.sniper).toBe('b');
        expect(byKind.solo).toBe('d');
        expect(byKind.trigger ?? byKind.brave).toBe('e');
    });

    it('gives nothing when alone or with no questions', () => {
        expect(computeRoomAwards(['a'], [answer('a', 0, true, 1_000)], 1, ANSWER_MS)).toEqual([]);
        expect(computeRoomAwards(['a', 'b'], [], 0, ANSWER_MS)).toEqual([]);
    });

    it('still gives «brave» when nobody earned anything', () => {
        const misses = [answer('a', 0, false, 1_000), answer('b', 0, false, 1_000)];
        expect(computeRoomAwards(['a', 'b'], misses, 1, ANSWER_MS)).toEqual([
            { kind: 'brave', playerId: 'b', value: 0 },
        ]);
    });
});

describe('room goal', () => {
    const answers = [
        answer('a', 0, true, 8_000, 600), answer('b', 0, false, 2_000, 0), answer('c', 0, true, 1_000, 950),
        answer('a', 1, true, 6_000, 700), answer('b', 1, true, 600, 990), answer('c', 1, false, 3_000, 0),
    ];
    const standings = computeRoomStandings(['a', 'b', 'c'], answers, 2);

    it('tells the leader the lead and others the gap to the next place', () => {
        expect(getRoomGoal(standings, 'a')).toEqual({ kind: 'lead', ahead: 310 });
        expect(getRoomGoal(standings, 'b')).toEqual({ kind: 'chase', targetRank: 1, behind: 310 });
        expect(getRoomGoal(standings, 'c')).toEqual({ kind: 'chase', targetRank: 2, behind: 40 });
    });

    it('stays quiet before anyone scores or alone', () => {
        expect(getRoomGoal(computeRoomStandings(['a', 'b'], [], 0), 'a')).toBeNull();
        expect(getRoomGoal(computeRoomStandings(['a'], answers, 2), 'a')).toBeNull();
    });
});

describe('guest nicknames', () => {
    for (const [locale, dictionary] of [['ru', ru], ['en', en]] as const) {
        const words = dictionary.room.nicknameWords;

        it(`${locale}: 30 × 30 words, most pairs fit, the generator always returns a valid name`, () => {
            expect(words.adjectives).toHaveLength(30);
            expect(words.nouns).toHaveLength(30);

            const pairs = words.adjectives.flatMap((adjective) =>
                words.nouns.map((noun) => `${adjective} ${noun}`),
            );
            const valid = pairs.filter((pair) => normalizeRoomNickname(pair) === pair);
            expect(valid.length / pairs.length).toBeGreaterThan(0.9);

            for (let run = 0; run < 300; run += 1) {
                const nickname = generateRoomNickname(words);
                expect(normalizeRoomNickname(nickname)).toBe(nickname);
                expect(nickname).not.toBe('Player');
            }
        });
    }
});
