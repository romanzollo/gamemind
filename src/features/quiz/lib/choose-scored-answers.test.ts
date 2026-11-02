import { describe, expect, it, vi } from 'vitest';

import { chooseScoredAnswers } from './choose-scored-answers';

const questions = [{ id: 'q-1' }, { id: 'q-2' }, { id: 'q-3' }];

describe('chooseScoredAnswers', () => {
    it('ignores the form once any answer was locked: no fixing an answer after the reveal', () => {
        const readForm = vi.fn(() => [
            { questionId: 'q-1', selectedOptionId: 'right-after-reveal' },
            { questionId: 'q-2', selectedOptionId: 'o-2' },
            { questionId: 'q-3', selectedOptionId: 'o-3' },
        ]);

        expect(
            chooseScoredAnswers(
                questions,
                [
                    { questionId: 'q-1', selectedOptionId: 'wrong-locked' },
                    { questionId: 'q-3', selectedOptionId: 'o-3' },
                ],
                readForm,
            ),
        ).toEqual({
            source: 'locked',
            answers: [
                { questionId: 'q-1', selectedOptionId: 'wrong-locked' },
                { questionId: 'q-2', selectedOptionId: '' },
                { questionId: 'q-3', selectedOptionId: 'o-3' },
            ],
        });
        expect(readForm).not.toHaveBeenCalled();
    });

    it('reads the form when nothing was locked (a page opened before lock-in)', () => {
        const formAnswers = [{ questionId: 'q-1', selectedOptionId: 'o-1' }];

        expect(chooseScoredAnswers(questions, [], () => formAnswers)).toEqual({
            source: 'form',
            answers: formAnswers,
        });
    });
});
