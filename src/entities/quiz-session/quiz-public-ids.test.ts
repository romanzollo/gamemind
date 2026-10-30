/**
 * Непрозрачные id игры: токены не выдают ответ и честно переводятся обратно.
 */

import { describe, expect, it } from 'vitest';

import type { SessionSnapshotPublicQuestion } from '@/entities/quiz-session/quiz-session.types';

import {
    createQuizPublicIdCodec,
    encodePublicQuestionIds,
    readSubmittedAnswers,
} from './quiz-public-ids';

const SECRET = 'test-secret';

const questions: SessionSnapshotPublicQuestion[] = [
    {
        id: 'img-med-bg3',
        text: 'Угадай игру по изображению.',
        difficulty: 'MEDIUM',
        type: 'IMAGE_GUESS',
        imageUrl: null,
        options: [
            { id: 'img-med-bg3-opt-2', text: 'Divinity', order: 0 },
            { id: 'img-med-bg3-opt-0', text: 'Baldur’s Gate 3', order: 1 },
        ],
    },
];

const scoring = [
    {
        id: 'img-med-bg3',
        options: [{ id: 'img-med-bg3-opt-0' }, { id: 'img-med-bg3-opt-2' }],
    },
    { id: 'q-2', options: [{ id: 'q-2-opt-0' }, { id: 'q-2-opt-1' }] },
];

function form(entries: Record<string, string>) {
    return { get: (name: string) => entries[name] ?? null };
}

describe('createQuizPublicIdCodec', () => {
    it('is stable inside a session and differs across sessions', () => {
        const a = createQuizPublicIdCodec('session-a', SECRET);
        const b = createQuizPublicIdCodec('session-b', SECRET);

        expect(a.option('x-opt-0')).toBe(a.option('x-opt-0'));
        expect(a.option('x-opt-0')).not.toBe(b.option('x-opt-0'));
        expect(a.question('x')).not.toBe(a.option('x'));
        expect(a.option('x-opt-0')).toMatch(/^[A-Za-z0-9_-]{16}$/);
    });

    it('fails loudly without a secret', () => {
        const previous = process.env.AUTH_SECRET;
        delete process.env.AUTH_SECRET;
        expect(() => createQuizPublicIdCodec('s')).toThrow(/AUTH_SECRET/);
        if (previous !== undefined) process.env.AUTH_SECRET = previous;
    });
});

describe('encodePublicQuestionIds', () => {
    it('hides DB ids but keeps texts and order', () => {
        const codec = createQuizPublicIdCodec('session-a', SECRET);
        const [encoded] = encodePublicQuestionIds(questions, codec);

        expect(JSON.stringify(encoded)).not.toMatch(/opt-|img-med/);
        expect(encoded.options.map((o) => [o.text, o.order])).toEqual([
            ['Divinity', 0],
            ['Baldur’s Gate 3', 1],
        ]);
    });
});

describe('readSubmittedAnswers', () => {
    const codec = createQuizPublicIdCodec('session-a', SECRET);

    it('maps question and option tokens back to DB ids', () => {
        const answers = readSubmittedAnswers(
            form({
                [codec.question('img-med-bg3')]: codec.option('img-med-bg3-opt-0'),
                [codec.question('q-2')]: codec.option('q-2-opt-1'),
            }),
            scoring,
            codec,
        );

        expect(answers).toEqual([
            { questionId: 'img-med-bg3', selectedOptionId: 'img-med-bg3-opt-0' },
            { questionId: 'q-2', selectedOptionId: 'q-2-opt-1' },
        ]);
    });

    it('keeps unanswered questions empty', () => {
        const answers = readSubmittedAnswers(
            form({
                [codec.question('q-2')]: codec.option('q-2-opt-0'),
            }),
            scoring,
            codec,
        );

        expect(answers[0]).toEqual({
            questionId: 'img-med-bg3',
            selectedOptionId: '',
        });
    });

    it('does not accept a token from another session', () => {
        const other = createQuizPublicIdCodec('session-b', SECRET);
        const forged = other.option('img-med-bg3-opt-0');
        const answers = readSubmittedAnswers(
            form({ [codec.question('img-med-bg3')]: forged }),
            scoring,
            codec,
        );

        // Не id из БД → submit отвергнет как INVALID_ANSWER.
        expect(answers[0].selectedOptionId).toBe(forged);
        expect(
            scoring[0].options.some((o) => o.id === answers[0].selectedOptionId),
        ).toBe(false);
    });

    it('reads DB ids from a page opened before tokens existed', () => {
        const answers = readSubmittedAnswers(
            form({ 'img-med-bg3': 'img-med-bg3-opt-2', 'q-2': 'q-2-opt-0' }),
            scoring,
            codec,
        );

        expect(answers.map((a) => a.selectedOptionId)).toEqual([
            'img-med-bg3-opt-2',
            'q-2-opt-0',
        ]);
    });
});
