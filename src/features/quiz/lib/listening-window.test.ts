import { describe, expect, it } from 'vitest';

import {
    AUDIO_LISTEN_WINDOW_SECONDS,
    advanceAudioQueue,
    arrangeAudioQuestions,
    blitzSessionDurationSeconds,
    computeListeningCredits,
    currentListeningWindow,
    replayBlitzLocks,
    type ListeningLock,
} from '@/features/quiz/lib/listening-window';

const S = 1000;
const WINDOW = AUDIO_LISTEN_WINDOW_SECONDS * S;

function lock(questionId: string, atSeconds: number, isAudio = false): ListeningLock {
    return { questionId, answeredAtMs: atSeconds * S, isAudio };
}

describe('computeListeningCredits', () => {
    it('credits time on an audio question, capped by the window', () => {
        const { totalMs, creditByQuestion } = computeListeningCredits({
            startMs: 0,
            locks: [lock('q1', 4), lock('a1', 9, true), lock('q2', 12), lock('a2', 40, true)],
        });
        expect(creditByQuestion.get('a1')).toBe(5 * S);
        expect(creditByQuestion.get('a2')).toBe(WINDOW);
        expect(creditByQuestion.get('q2')).toBe(0);
        expect(totalMs).toBe(5 * S + WINDOW);
    });

    it('sorts by time, not by array order', () => {
        const { creditByQuestion } = computeListeningCredits({
            startMs: 0,
            locks: [lock('a1', 9, true), lock('q1', 4)],
        });
        expect(creditByQuestion.get('a1')).toBe(5 * S);
    });
});

describe('currentListeningWindow', () => {
    it('runs from the last answer and stops at the window', () => {
        const locks = [lock('q1', 4)];
        expect(
            currentListeningWindow({ startMs: 0, locks, currentIsAudio: true, nowMs: 7 * S }),
        ).toEqual({ creditMs: 3 * S, active: true, remainingMs: WINDOW - 3 * S });
        expect(
            currentListeningWindow({ startMs: 0, locks, currentIsAudio: true, nowMs: 30 * S }),
        ).toEqual({ creditMs: WINDOW, active: false, remainingMs: 0 });
        expect(
            currentListeningWindow({ startMs: 0, locks, currentIsAudio: false, nowMs: 7 * S })
                .creditMs,
        ).toBe(0);
    });
});

describe('replayBlitzLocks', () => {
    const grace = 3;

    it('without audio matches the old rule (answeredAt − grace < timedEndsAt)', () => {
        const locks = [lock('q1', 10), lock('q2', 62), lock('q3', 63.5)];
        const result = replayBlitzLocks({
            timedEndsAtMs: 60 * S,
            durationSeconds: 60,
            audioQuestionCount: 0,
            locks,
            graceSeconds: grace,
        });
        expect(result.counted.map((item) => item.questionId)).toEqual(['q1', 'q2']);
        expect(result.late.map((item) => item.questionId)).toEqual(['q3']);
        expect(result.clockCreditMs).toBe(0);
    });

    it('stretches the deadline by the pause on the audio question', () => {
        // Потолок 72 с (1 аудио); база 60 с. Пауза 8 с → дедлайн 68 с.
        const locks = [lock('q1', 20), lock('a1', 28, true), lock('q2', 66), lock('q3', 72)];
        const result = replayBlitzLocks({
            timedEndsAtMs: 72 * S,
            durationSeconds: 60,
            audioQuestionCount: 1,
            locks,
            graceSeconds: grace,
        });
        expect(result.counted.map((item) => item.questionId)).toEqual(['q1', 'a1', 'q2']);
        expect(result.late.map((item) => item.questionId)).toEqual(['q3']);
        expect(result.clockCreditMs).toBe(8 * S);
    });

    it('gives at most the window, however long the player listened', () => {
        const locks = [lock('q1', 5), lock('a1', 40, true), lock('q2', 71)];
        const result = replayBlitzLocks({
            timedEndsAtMs: 72 * S,
            durationSeconds: 60,
            audioQuestionCount: 1,
            locks,
            graceSeconds: grace,
        });
        // Дедлайн 60 + 12 = 72 с: q2 на 71 с засчитан.
        expect(result.counted).toHaveLength(3);
        expect(result.clockCreditMs).toBe(WINDOW);
    });

    it('once late, nothing after counts', () => {
        const locks = [lock('q1', 64), lock('a1', 65, true)];
        const result = replayBlitzLocks({
            timedEndsAtMs: 72 * S,
            durationSeconds: 60,
            audioQuestionCount: 1,
            locks,
            graceSeconds: grace,
        });
        expect(result.counted).toHaveLength(0);
        expect(result.late).toHaveLength(2);
    });
});

describe('blitzSessionDurationSeconds', () => {
    it('adds a window per audio question', () => {
        expect(blitzSessionDurationSeconds(60, 0)).toBe(60);
        expect(blitzSessionDurationSeconds(60, 2)).toBe(60 + 2 * AUDIO_LISTEN_WINDOW_SECONDS);
    });
});

describe('arrangeAudioQuestions', () => {
    const T = { type: 'TEXT' as const };
    const A = { type: 'AUDIO_GUESS' as const };
    const label = (items: Array<{ type?: string }>) =>
        items.map((item) => (item.type === 'AUDIO_GUESS' ? 'A' : 'T')).join('');

    it('never starts with audio and never puts two in a row', () => {
        expect(label(arrangeAudioQuestions([A, T, T]))).toBe('TAT');
        expect(label(arrangeAudioQuestions([T, A, A, T, T]))).toBe('TATAT');
        expect(label(arrangeAudioQuestions([A, A, T, T]))).toBe('TATA');
    });

    it('keeps a valid order untouched and keeps item identity', () => {
        const items = [
            { type: 'TEXT' as const, id: 1 },
            { type: 'AUDIO_GUESS' as const, id: 2 },
            { type: 'TEXT' as const, id: 3 },
        ];
        expect(arrangeAudioQuestions(items)).toEqual(items);
    });

    it('gives up quietly when there are not enough text questions', () => {
        expect(label(arrangeAudioQuestions([A, A]))).toBe('AA');
    });
});

describe('advanceAudioQueue', () => {
    const base = {
        isDone: () => false,
        deferred: new Set<number>(),
    };

    it('moves a not-ready clip to the end once, then skips it', () => {
        const first = advanceAudioQueue({
            ...base,
            order: [0, 1, 2, 3],
            position: 0,
            notReady: (index) => index === 1,
        });
        expect(first.order).toEqual([0, 2, 3, 1]);
        expect(first.position).toBe(1);
        expect(first.skipped).toEqual([]);

        const atEnd = advanceAudioQueue({
            ...base,
            order: first.order,
            position: 2,
            deferred: first.deferred,
            notReady: (index) => index === 1,
        });
        expect(atEnd.position).toBeNull();
        expect(atEnd.skipped).toEqual([1]);
    });

    it('plays the deferred clip if it loaded meanwhile', () => {
        const result = advanceAudioQueue({
            ...base,
            order: [0, 2, 3, 1],
            position: 2,
            deferred: new Set([1]),
            notReady: () => false,
        });
        expect(result.position).toBe(3);
    });

    it('skips answered questions', () => {
        const result = advanceAudioQueue({
            ...base,
            order: [0, 1, 2],
            position: 0,
            isDone: (index) => index === 1,
            notReady: () => false,
        });
        expect(result.position).toBe(2);
    });
});
