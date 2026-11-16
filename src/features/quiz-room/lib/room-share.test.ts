import { describe, expect, it } from 'vitest';

import { ruDictionary as ru } from '@/shared/i18n/dictionaries/ru';

import { buildRoomInviteShare, buildRoomResultShare } from './room-share';

const text = ru.room;
const resultLabels = {
    win: text.shareWin,
    silver: text.shareSilver,
    bronze: text.shareBronze,
    place: text.sharePlace,
    score: text.shareScore,
    lead: text.shareLead,
    gap: text.shareGap,
    cta: text.shareCta,
};

describe('room share texts', () => {
    it('invite: code first, host and settings, then players and link', () => {
        const share = buildRoomInviteShare(
            {
                code: 'VK9F',
                hostName: 'roman',
                settings: '10 вопросов · Смешанная · 15 с на ответ',
                players: '3 игрока',
                url: 'https://www.game-mind.ru/ru/room/VK9F',
            },
            { header: text.shareInviteHeader, host: text.shareInviteHost, players: text.shareInvitePlayers },
        );

        expect(share.text).toBe(
            [
                '🎮 Комната GameMind · код VK9F',
                'roman зовёт: 10 вопросов · Смешанная · 15 с на ответ',
                '👥 Уже 3 игрока — заходи, пока не начали!',
                'https://www.game-mind.ru/ru/room/VK9F',
            ].join('\n'),
        );
        expect(share.targets.telegram).toContain(encodeURIComponent('https://www.game-mind.ru/ru/room/VK9F'));
    });

    it('result: place header, squares and score, award with lead, call to action', () => {
        const winner = buildRoomResultShare(
            {
                code: 'VK9F',
                place: 1,
                total: 3,
                marks: ['correct', 'wrong', 'missed'],
                score: '3 748 очков',
                award: '⚡ Самый быстрый',
                lead: { name: 'roman', points: '420 очков' },
                gap: null,
                url: 'https://www.game-mind.ru/ru/room/VK9F/results',
            },
            resultLabels,
        );

        expect(winner.text.split('\n')).toEqual([
            '🏆 1-е место в комнате VK9F!',
            '🟩🟥⬜ · 3 748 очков',
            '⚡ Самый быстрый · обошёл roman на 420 очков',
            'Сможешь лучше? Собери свою комнату 👇',
            'https://www.game-mind.ru/ru/room/VK9F/results',
        ]);

        const fourth = buildRoomResultShare(
            {
                code: 'VK9F',
                place: 4,
                total: 5,
                marks: ['wrong'],
                score: '500 очков',
                award: null,
                lead: null,
                gap: '120 очков',
                url: 'u',
            },
            resultLabels,
        );

        expect(fourth.text.split('\n').slice(0, 3)).toEqual([
            '4-е место из 5 в комнате VK9F',
            '🟥 · 500 очков',
            'до победы не хватило 120 очков',
        ]);
    });
});
