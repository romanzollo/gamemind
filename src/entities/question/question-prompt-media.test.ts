import { describe, expect, it } from 'vitest';

import {
    normalizeQuizAudioUrl,
    promptMediaForType,
    toQuestionType,
} from '@/entities/question/question-prompt-media';

describe('toQuestionType', () => {
    it('keeps known types and falls back to TEXT', () => {
        expect(toQuestionType('IMAGE_GUESS')).toBe('IMAGE_GUESS');
        expect(toQuestionType('AUDIO_GUESS')).toBe('AUDIO_GUESS');
        expect(toQuestionType('TEXT')).toBe('TEXT');
        expect(toQuestionType('SOMETHING')).toBe('TEXT');
        expect(toQuestionType(null)).toBe('TEXT');
    });
});

describe('promptMediaForType', () => {
    it('puts the clip under audioUrl and never under imageUrl', () => {
        expect(
            promptMediaForType('AUDIO_GUESS', ' /media/audio/0123abcd.mp3 '),
        ).toEqual({ imageUrl: null, audioUrl: '/media/audio/0123abcd.mp3' });
    });

    it('keeps images as before (incl. legacy svg → webp)', () => {
        expect(
            promptMediaForType('IMAGE_GUESS', '/quiz-images/easy/x.svg'),
        ).toEqual({ imageUrl: '/quiz-images/easy/x.webp' });
        expect(promptMediaForType('TEXT', null)).toEqual({ imageUrl: null });
    });
});

describe('normalizeQuizAudioUrl', () => {
    it('returns a clip only for AUDIO_GUESS', () => {
        expect(normalizeQuizAudioUrl('AUDIO_GUESS', '/media/audio/a.mp3')).toBe(
            '/media/audio/a.mp3',
        );
        expect(normalizeQuizAudioUrl('IMAGE_GUESS', '/media/audio/a.mp3')).toBe(
            null,
        );
        expect(normalizeQuizAudioUrl('AUDIO_GUESS', '  ')).toBe(null);
    });
});
