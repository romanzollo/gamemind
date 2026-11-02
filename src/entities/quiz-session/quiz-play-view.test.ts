import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { openQuizAnswerKey } from './quiz-answer-key';
import { toBrowserPlayView } from './quiz-play-view';
import { createQuizPublicIdCodec } from './quiz-public-ids';
import type { QuizSessionPublicView } from './quiz-session.types';

const SECRET = 'play-view-test-secret-0123456789abcdef';

beforeAll(() => {
    vi.stubEnv('AUTH_SECRET', SECRET);
});

afterAll(() => {
    vi.unstubAllEnvs();
});

function view(
    patch: Partial<QuizSessionPublicView> = {},
): QuizSessionPublicView {
    return {
        questions: [
            {
                id: 'q-vg-easy-004',
                text: 'Как зовут брата Марио?',
                difficulty: 'EASY',
                options: [
                    {
                        id: 'q-vg-easy-004-opt-0',
                        text: 'Луиджи',
                        order: 0,
                        isCorrect: true,
                    },
                    {
                        id: 'q-vg-easy-004-opt-1',
                        text: 'Варио',
                        order: 1,
                        isCorrect: false,
                    },
                ],
            },
        ],
        timedEndsAt: null,
        difficulty: 'EASY',
        survival: null,
        isDaily: false,
        lockedAnswers: [
            {
                questionId: 'q-vg-easy-004',
                selectedOptionId: 'q-vg-easy-004-opt-1',
                correctOptionId: 'q-vg-easy-004-opt-0',
                isCorrect: false,
            },
        ],
        ...patch,
    };
}

describe('toBrowserPlayView', () => {
    it('ships no DB id and no isCorrect for Classic, only tokens and an answer key', () => {
        const browser = toBrowserPlayView('session-1', view());
        const json = JSON.stringify(browser);

        expect(json).not.toContain('q-vg-easy-004');
        expect(json).not.toContain('isCorrect":true');
        expect(browser.questions[0].options[0]).not.toHaveProperty('isCorrect');

        const key = openQuizAnswerKey(
            browser.questions[0].answerKey ?? '',
            'session-1',
        );
        expect(key).toEqual({
            sessionId: 'session-1',
            questionId: 'q-vg-easy-004',
            optionIds: ['q-vg-easy-004-opt-0', 'q-vg-easy-004-opt-1'],
            correctOptionId: 'q-vg-easy-004-opt-0',
        });
    });

    it('turns locked answers into session tokens for the resume', () => {
        const codec = createQuizPublicIdCodec('session-1');

        expect(toBrowserPlayView('session-1', view()).lockedAnswers).toEqual([
            {
                questionId: codec.question('q-vg-easy-004'),
                selectedOptionId: codec.option('q-vg-easy-004-opt-1'),
                correctOptionId: codec.option('q-vg-easy-004-opt-0'),
                isCorrect: false,
            },
        ]);
    });

    it('gives Survival an answer key and no isCorrect either', () => {
        const browser = toBrowserPlayView(
            'session-1',
            view({
                survival: {
                    runId: 'run-1',
                    waveIndex: 1,
                    startedAt: '2026-11-02T12:00:00.000Z',
                    initialBankSeconds: 20,
                },
            }),
        );

        expect(
            openQuizAnswerKey(browser.questions[0].answerKey ?? '', 'session-1')
                ?.correctOptionId,
        ).toBe('q-vg-easy-004-opt-0');
        expect(JSON.stringify(browser)).not.toContain('isCorrect":true');
        expect(browser.questions[0].options[0]).not.toHaveProperty('isCorrect');
    });
});
