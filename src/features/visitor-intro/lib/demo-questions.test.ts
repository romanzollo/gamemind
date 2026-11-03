import { describe, expect, it } from 'vitest';

import {
    DEMO_QUESTIONS,
    pickDemoStartIndex,
    toDemoQuestionView,
} from './demo-questions';

describe('DEMO_QUESTIONS', () => {
    it('follows the question standard: 4 options, one correct, not first', () => {
        for (const question of DEMO_QUESTIONS) {
            expect(question.options).toHaveLength(4);
            expect(question.options.filter((o) => o.correct)).toHaveLength(1);
            expect(question.options[0].correct).toBeUndefined();
        }
    });

    it('has every text in both languages and unique ids', () => {
        const ids = new Set(DEMO_QUESTIONS.map((question) => question.id));

        expect(ids.size).toBe(DEMO_QUESTIONS.length);

        for (const question of DEMO_QUESTIONS) {
            expect(question.text.ru.trim()).not.toBe('');
            expect(question.text.en.trim()).not.toBe('');
            expect(question.text.ru).not.toBe(question.text.en);

            for (const option of question.options) {
                expect(option.text.ru.trim()).not.toBe('');
                expect(option.text.en.trim()).not.toBe('');
            }
        }
    });
});

describe('toDemoQuestionView', () => {
    it('points correctOptionId at the correct option in the locale', () => {
        const view = toDemoQuestionView(DEMO_QUESTIONS[0], 'en');
        const correct = view.options.find((o) => o.id === view.correctOptionId);

        expect(correct?.text).toBe('Mario');
        expect(view.options).toHaveLength(4);
    });
});

describe('pickDemoStartIndex', () => {
    it('is stable within a day and moves to the next question tomorrow', () => {
        const today = pickDemoStartIndex('2026-11-03', 5);

        expect(pickDemoStartIndex('2026-11-03', 5)).toBe(today);
        expect(pickDemoStartIndex('2026-11-04', 5)).toBe((today + 1) % 5);
    });

    it('falls back to the first question on a broken key', () => {
        expect(pickDemoStartIndex('not-a-date', 5)).toBe(0);
        expect(pickDemoStartIndex('2026-11-03', 0)).toBe(0);
    });
});
