import { describe, expect, it } from 'vitest';

import { getPlayTopicName, isPlayTopicId } from './play-topic';

describe('isPlayTopicId', () => {
    it('accepts tag ids of the catalog', () => {
        for (const id of [
            'games.era.2010s',
            'games.genre.action-adventure',
            'games.platform.nintendo',
        ]) {
            expect(isPlayTopicId(id), id).toBe(true);
        }
    });

    it('rejects anything that is not domain.facet.slug', () => {
        for (const value of [
            'nintendo',
            'games.platform',
            'games.platform.nintendo.switch',
            'Games.era.2010s',
            'games.era.-2010s',
            "games.era.2010s'",
            '',
            42,
            null,
        ]) {
            expect(isPlayTopicId(value), String(value)).toBe(false);
        }
    });
});

describe('getPlayTopicName', () => {
    it('picks the column for the interface language', () => {
        const topic = { nameRu: 'Шутеры', nameEn: 'Shooters' };

        expect(getPlayTopicName(topic, 'ru')).toBe('Шутеры');
        expect(getPlayTopicName(topic, 'en')).toBe('Shooters');
    });
});
