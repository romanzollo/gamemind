import { describe, expect, it } from 'vitest';

import { nextRoomPollDelay } from './room-poll';
import { DEFAULT_ROOM_SETTINGS } from './room-rules';
import type { RoomStateDto } from '../types';

const schedule = [
    { position: 0, introAt: 10_000, openAt: 14_000, closeAt: 29_000 },
    { position: 1, introAt: 36_000, openAt: 40_000, closeAt: 55_000 },
];

function state(patch: Partial<RoomStateDto>): RoomStateDto {
    return {
        serverNow: 0,
        code: 'K7QF',
        status: 'playing',
        isHost: false,
        me: { playerId: 'p1', nickname: 'Аня' },
        settings: { ...DEFAULT_ROOM_SETTINGS, topicName: null },
        players: [],
        schedule,
        current: null,
        standings: [],
        myMarks: [],
        nextRoomCode: null,
        ...patch,
    };
}

const question = {
    position: 0,
    type: 'TEXT' as const,
    difficulty: 'EASY' as const,
    imageUrl: null,
    text: 'Q',
    options: null,
    answeredPlayerIds: [],
    myAnswerKey: null,
    reveal: null,
};

describe('room poll delay', () => {
    it('polls the lobby steadily and stops on closed / after rematch', () => {
        expect(nextRoomPollDelay(state({ status: 'lobby', schedule: [] }), 0)).toBe(1_500);
        expect(nextRoomPollDelay(state({ status: 'closed' }), 0)).toBeNull();
        expect(nextRoomPollDelay(state({ status: 'finished' }), 0)).toBe(3_000);
        expect(nextRoomPollDelay(state({ status: 'finished', nextRoomCode: 'AB23' }), 0)).toBeNull();
    });

    it('wakes up right after the countdown ends', () => {
        expect(nextRoomPollDelay(state({}), 9_000)).toBe(1_120);
        expect(nextRoomPollDelay(state({}), 5_000)).toBe(2_000);
    });

    it('asks soon when the phase data is missing', () => {
        expect(nextRoomPollDelay(state({}), 11_000)).toBe(300);
        expect(nextRoomPollDelay(state({ current: question }), 15_000)).toBe(300);
        expect(nextRoomPollDelay(state({ current: question }), 30_000)).toBe(300);
    });

    it('waits for the options, polls often while answers are open', () => {
        expect(nextRoomPollDelay(state({ current: question }), 13_000)).toBe(1_120);
        const open = { ...question, options: [{ key: 'a', text: 'A' }] };
        expect(nextRoomPollDelay(state({ current: open }), 15_000)).toBe(1_500);
        expect(nextRoomPollDelay(state({ current: open }), 28_500)).toBe(620);
    });
});
