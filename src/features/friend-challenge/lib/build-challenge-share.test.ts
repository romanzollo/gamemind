import { describe, expect, it } from 'vitest';

import { buildChallengeShare } from './build-challenge-share';

const labels = {
    header: 'Вызов от {name}',
    scoreLine: 'Счёт: {score}',
    invite: 'Побьёшь?',
    title: '{name} бросает вызов: {score}',
};

const URL = 'https://gamemind.ru/ru/challenge/abcdefghijk';

describe('buildChallengeShare', () => {
    const share = buildChallengeShare(
        {
            creatorName: 'gm_smoke',
            setLine: 'Классика · Легко · 3 вопроса',
            score: '2 / 3',
            marks: [true, true, false],
            url: URL,
        },
        labels,
    );

    it('writes short lines: who, the set, the score with squares, the call', () => {
        expect(share.textWithoutUrl).toBe(
            '⚔️ Вызов от gm_smoke\nКлассика · Легко · 3 вопроса\nСчёт: 2 / 3  🟩🟩🟥\nПобьёшь?',
        );
        expect(share.text.endsWith(`\n${URL}`)).toBe(true);
    });

    it('titles the share with the name and the score', () => {
        expect(share.title).toBe('gm_smoke бросает вызов: 2 / 3');
    });

    it('lets Telegram add the link itself', () => {
        expect(share.targets.telegram).toContain(`url=${encodeURIComponent(URL)}`);
        expect(share.targets.telegram).toContain(
            `text=${encodeURIComponent(share.textWithoutUrl)}`,
        );
    });
});
