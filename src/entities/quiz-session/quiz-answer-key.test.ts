import { describe, expect, it } from 'vitest';

import {
    openQuizAnswerKey,
    sealQuizAnswerKey,
    type QuizAnswerKeyPayload,
} from './quiz-answer-key';

const SECRET = 'answer-key-test-secret-0123456789abcdef';
const payload: QuizAnswerKeyPayload = {
    sessionId: 'session-1',
    questionId: 'q-vg-easy-004',
    optionIds: ['opt-a', 'opt-b', 'opt-c', 'opt-d'],
    correctOptionId: 'opt-c',
};

describe('quiz answer key', () => {
    it('opens what it sealed, for the same session', () => {
        const token = sealQuizAnswerKey(payload, SECRET);

        expect(openQuizAnswerKey(token, 'session-1', SECRET)).toEqual(payload);
    });

    it('does not show the answer: no option id is readable in the token', () => {
        const token = sealQuizAnswerKey(payload, SECRET);
        const bytes = Buffer.from(token, 'base64url').toString('latin1');

        for (const id of [...payload.optionIds, payload.questionId]) {
            expect(bytes).not.toContain(id);
        }
    });

    it('gives a different token each time (random IV)', () => {
        expect(sealQuizAnswerKey(payload, SECRET)).not.toBe(
            sealQuizAnswerKey(payload, SECRET),
        );
    });

    it('refuses another session, another secret and any edited byte', () => {
        const token = sealQuizAnswerKey(payload, SECRET);
        const bytes = Buffer.from(token, 'base64url');
        bytes[bytes.length - 1] ^= 1;

        expect(openQuizAnswerKey(token, 'session-2', SECRET)).toBeNull();
        expect(
            openQuizAnswerKey(token, 'session-1', `${SECRET}-other`),
        ).toBeNull();
        expect(
            openQuizAnswerKey(bytes.toString('base64url'), 'session-1', SECRET),
        ).toBeNull();
        expect(openQuizAnswerKey('', 'session-1', SECRET)).toBeNull();
        expect(openQuizAnswerKey('not a key', 'session-1', SECRET)).toBeNull();
    });
});
