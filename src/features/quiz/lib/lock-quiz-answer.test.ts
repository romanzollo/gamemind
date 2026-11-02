import { describe, expect, it, vi } from 'vitest';

import { sealQuizAnswerKey } from '@/entities/quiz-session/quiz-answer-key';
import { createQuizPublicIdCodec } from '@/entities/quiz-session/quiz-public-ids';

import { lockQuizAnswer, type LockQuizAnswerDeps } from './lock-quiz-answer';

const SECRET = 'lock-answer-test-secret-0123456789abcdef';
const SESSION = 'session-1';
const codec = createQuizPublicIdCodec(SESSION, SECRET);
const key = sealQuizAnswerKey(
    {
        sessionId: SESSION,
        questionId: 'q-1',
        optionIds: ['o-a', 'o-b', 'o-c', 'o-d'],
        correctOptionId: 'o-c',
    },
    SECRET,
);
const receivedAt = new Date('2026-11-02T12:00:00Z');

function deps(patch: Partial<LockQuizAnswerDeps> = {}): LockQuizAnswerDeps {
    return {
        insertLockedAnswer: vi.fn(async () => true),
        findLockedAnswer: vi.fn(async () => null),
        findAnswerSessionState: vi.fn(async () => null),
        ...patch,
    };
}

function answer(optionId: string, repo: LockQuizAnswerDeps, answerKey = key) {
    return lockQuizAnswer(
        {
            sessionId: SESSION,
            userId: 'user-1',
            questionToken: codec.question('q-1'),
            optionToken: codec.option(optionId),
            answerKey,
            receivedAt,
            secret: SECRET,
        },
        repo,
    );
}

describe('lockQuizAnswer', () => {
    it('writes the answer with DB ids and returns only session tokens', async () => {
        const repo = deps();

        await expect(answer('o-b', repo)).resolves.toEqual({
            status: 'locked',
            replay: false,
            correct: false,
            selectedOption: codec.option('o-b'),
            correctOption: codec.option('o-c'),
        });
        expect(repo.insertLockedAnswer).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: SESSION,
                userId: 'user-1',
                questionId: 'q-1',
                selectedOptionId: 'o-b',
                isCorrect: false,
                answeredAt: receivedAt,
                // Блиц: дедлайн с запасом grace (3 с), JS Date, не SQL NOW().
                deadlineFloor: new Date(receivedAt.getTime() - 3000),
            }),
        );
    });

    it('marks the right option as correct', async () => {
        await expect(answer('o-c', deps())).resolves.toMatchObject({
            correct: true,
        });
    });

    it('returns the first answer again on a retry: the first one wins', async () => {
        const repo = deps({
            insertLockedAnswer: vi.fn(async () => false),
            findLockedAnswer: vi.fn(async () => ({
                questionId: 'q-1',
                selectedOptionId: 'o-c',
                isCorrect: true,
            })),
        });

        await expect(answer('o-a', repo)).resolves.toEqual({
            status: 'locked',
            replay: true,
            correct: true,
            selectedOption: codec.option('o-c'),
            correctOption: codec.option('o-c'),
        });
    });

    it('says time is up for a Blitz answer after the deadline and grace', async () => {
        const repo = deps({
            insertLockedAnswer: vi.fn(async () => false),
            findAnswerSessionState: vi.fn(async () => ({
                status: 'IN_PROGRESS' as const,
                timedEndsAt: new Date(receivedAt.getTime() - 10_000),
                isSurvival: false,
            })),
        });

        await expect(answer('o-a', repo)).resolves.toEqual({
            status: 'time_up',
        });
    });

    it('treats a submitted or foreign session as closed', async () => {
        const completed = deps({
            insertLockedAnswer: vi.fn(async () => false),
            findAnswerSessionState: vi.fn(async () => ({
                status: 'COMPLETED' as const,
                timedEndsAt: null,
                isSurvival: false,
            })),
        });

        await expect(answer('o-a', completed)).resolves.toEqual({
            status: 'closed',
        });
        await expect(
            answer(
                'o-a',
                deps({ insertLockedAnswer: vi.fn(async () => false) }),
            ),
        ).resolves.toEqual({ status: 'closed' });
    });

    it('refuses a forged key, a key from another session and an option from another question', async () => {
        const repo = deps();
        const otherSessionKey = sealQuizAnswerKey(
            {
                sessionId: 'session-2',
                questionId: 'q-1',
                optionIds: ['o-a', 'o-b', 'o-c', 'o-d'],
                correctOptionId: 'o-a',
            },
            SECRET,
        );

        await expect(answer('o-a', repo, 'forged')).resolves.toEqual({
            status: 'invalid',
        });
        await expect(answer('o-a', repo, otherSessionKey)).resolves.toEqual({
            status: 'invalid',
        });
        await expect(answer('o-zzz', repo)).resolves.toEqual({
            status: 'invalid',
        });
        expect(repo.insertLockedAnswer).not.toHaveBeenCalled();
    });
});
