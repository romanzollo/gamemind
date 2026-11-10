import { describe, expect, it } from 'vitest';

import {
    buildAudioCreditMetadataPatch,
    sameAudioCredit,
    toAdminAudioCredit,
} from './audio-credit-metadata';

const CREDIT = {
    track: ' Dragonborn ',
    composer: 'Jeremy Soule',
    performer: '',
    source: '',
};

describe('buildAudioCreditMetadataPatch', () => {
    it('merges filled fields and removes empty ones', () => {
        expect(
            buildAudioCreditMetadataPatch({
                type: 'AUDIO_GUESS',
                audioCredit: CREDIT,
            }),
        ).toEqual({
            patch: JSON.stringify({
                track: 'Dragonborn',
                composer: 'Jeremy Soule',
            }),
            removedKeys: ['performer', 'source'],
        });
    });

    it('leaves metadata alone for other types', () => {
        for (const type of ['TEXT', 'IMAGE_GUESS'] as const) {
            expect(
                buildAudioCreditMetadataPatch({ type, audioCredit: CREDIT }),
            ).toEqual({ patch: null, removedKeys: null });
        }
    });
});

describe('editor values', () => {
    it('missing keys become empty strings', () => {
        expect(
            toAdminAudioCredit({
                track: 'Dragonborn',
                composer: null,
                performer: null,
                source: null,
            }),
        ).toEqual({
            track: 'Dragonborn',
            composer: '',
            performer: '',
            source: '',
        });
    });

    it('compares after trimming the form input', () => {
        const stored = toAdminAudioCredit({
            track: 'Dragonborn',
            composer: 'Jeremy Soule',
            performer: null,
            source: null,
        });

        expect(sameAudioCredit(stored, CREDIT)).toBe(true);
        expect(sameAudioCredit(stored, { ...CREDIT, source: 'OST' })).toBe(
            false,
        );
    });
});
