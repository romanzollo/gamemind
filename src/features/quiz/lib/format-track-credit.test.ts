import { describe, expect, it } from 'vitest';

import { formatTrackCredit } from './format-track-credit';

const labels = {
    trackCredit: 'Трек: {track} · {composer}',
    trackCreditWithPerformer: 'Трек: {track} · {composer} · исп. {performer}',
};

describe('formatTrackCredit', () => {
    it('uses the short template without a performer', () => {
        expect(
            formatTrackCredit({ track: 'Sweden', composer: 'C418' }, labels),
        ).toBe('Трек: Sweden · C418');
    });

    it('adds the performer when present', () => {
        expect(
            formatTrackCredit(
                {
                    track: 'Soviet Connection',
                    composer: 'Michael Hunter',
                    performer: 'Geek Music',
                },
                labels,
            ),
        ).toBe('Трек: Soviet Connection · Michael Hunter · исп. Geek Music');
    });
});
