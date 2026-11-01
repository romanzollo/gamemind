/**
 * Unit-тесты текста «Поделиться результатом» (pure).
 */

import { describe, expect, it } from 'vitest';

import {
    buildResultShare,
    buildShareSquares,
    buildShareTargets,
    buildShareTitle,
    type ResultShareLabels,
} from './build-result-share';

const RU: ResultShareLabels = {
    scoreLine: '{correct}/{total} · {points}',
    points: { one: '{n} очко', few: '{n} очка', many: '{n} очков', other: '{n} очка' },
    survivalLine: '{points} за забег · волна {wave}',
    streakLine: 'Серия: {days}',
    streakDays: {
        one: '{n} день подряд',
        few: '{n} дня подряд',
        many: '{n} дней подряд',
        other: '{n} дня подряд',
    },
    invite: 'Сыграешь лучше?',
};

const URL = 'https://www.game-mind.ru/ru?ref=share';

describe('buildShareSquares', () => {
    it('orders squares by zero-based position and marks gaps as unanswered', () => {
        // Позиции разбора — с нуля (QuizResultReview показывает position + 1).
        expect(
            buildShareSquares(
                [
                    { position: 1, isCorrect: false },
                    { position: 0, isCorrect: true },
                    { position: 3, isCorrect: true },
                ],
                4,
            ),
        ).toEqual(['correct', 'wrong', 'none', 'correct']);
    });
});

describe('buildResultShare', () => {
    it('builds a Daily share with squares and streak', () => {
        const share = buildResultShare(
            {
                kind: 'quiz',
                title: 'GameMind — Челлендж дня 31.10',
                correct: 2,
                total: 3,
                score: 21,
                squares: ['correct', 'wrong', 'correct'],
                streakDays: 2,
            },
            RU,
            'ru',
            URL,
        );

        expect(share.text).toBe(
            [
                'GameMind — Челлендж дня 31.10',
                '2/3 · 21 очко',
                '🟩🟥🟩',
                'Серия: 2 дня подряд',
                `Сыграешь лучше? ${URL}`,
            ].join('\n'),
        );
        expect(share.textWithoutUrl.endsWith('Сыграешь лучше?')).toBe(true);
    });

    it('skips squares while the review is loading and the streak for non-Daily', () => {
        const share = buildResultShare(
            {
                kind: 'quiz',
                title: 'GameMind — Классика · Легко',
                correct: 5,
                total: 10,
                score: 5,
                squares: null,
                streakDays: null,
            },
            RU,
            'ru',
            URL,
        );

        expect(share.text.split('\n')).toEqual([
            'GameMind — Классика · Легко',
            '5/10 · 5 очков',
            `Сыграешь лучше? ${URL}`,
        ]);
    });

    it('builds a Survival share without squares', () => {
        const share = buildResultShare(
            { kind: 'survival', title: 'GameMind — Выживание · Средне', runScore: 24, waveIndex: 3 },
            RU,
            'ru',
            URL,
        );

        expect(share.text.split('\n')[1]).toBe('24 очка за забег · волна 3');
    });
});

describe('buildShareTitle', () => {
    const labels = {
        titleDaily: 'GameMind — Челлендж дня {date}',
        titleClassic: 'GameMind — Классика · {difficulty}',
        titleBlitz: 'GameMind — Блиц · {difficulty}',
        titleSurvival: 'GameMind — Выживание · {difficulty}',
    };

    it('uses the Moscow date for the Daily challenge', () => {
        // 22:30 UTC 31.10 = 01:30 МСК 01.11.
        expect(
            buildShareTitle(
                { mode: 'daily', difficultyLabel: 'Средне', completedAt: new Date(Date.UTC(2026, 9, 31, 22, 30)) },
                labels,
            ),
        ).toBe('GameMind — Челлендж дня 01.11');
    });

    it('uses mode and difficulty for other modes', () => {
        expect(
            buildShareTitle({ mode: 'blitz', difficultyLabel: 'Смешанная', completedAt: new Date() }, labels),
        ).toBe('GameMind — Блиц · Смешанная');
    });
});

describe('buildShareTargets', () => {
    it('encodes text and url for Telegram, VK and MAX', () => {
        const share = buildResultShare(
            { kind: 'survival', title: 'GameMind — Выживание', runScore: 1, waveIndex: 1 },
            RU,
            'ru',
            URL,
        );
        const targets = buildShareTargets(share);

        expect(targets.telegram).toContain(`url=${encodeURIComponent(URL)}`);
        expect(decodeURIComponent(targets.telegram.split('&text=')[1]!)).toBe(share.textWithoutUrl);
        expect(targets.vk).toContain(`title=${encodeURIComponent(share.title)}`);
        expect(decodeURIComponent(targets.max.split('?text=')[1]!)).toBe(share.text);
    });
});
