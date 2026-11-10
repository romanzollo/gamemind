import { describe, expect, it } from 'vitest';

import {
    computeWaveformPeaks,
    formatClipTime,
    placeholderWaveform,
} from '@/features/quiz/lib/quiz-audio-waveform';

describe('computeWaveformPeaks', () => {
    it('normalizes to the loudest bucket and keeps quiet parts visible', () => {
        const samples = new Float32Array(400);
        samples.fill(0.5, 0, 100); // громко
        samples.fill(0.25, 100, 200); // вдвое тише
        // 200..400 — тишина
        const peaks = computeWaveformPeaks([samples], 4);
        expect(peaks).toEqual([1, 0.56, 0.12, 0.12]);
    });

    it('takes the louder channel', () => {
        const left = new Float32Array(100);
        const right = new Float32Array(100).fill(0.8);
        expect(computeWaveformPeaks([left, right], 2)).toEqual([1, 1]);
    });

    it('returns a placeholder for empty input', () => {
        expect(computeWaveformPeaks([], 3)).toEqual(placeholderWaveform(3));
        expect(computeWaveformPeaks([new Float32Array(10)], 2)).toEqual([0.12, 0.12]);
    });
});

describe('formatClipTime', () => {
    it('formats seconds as m:ss', () => {
        expect(formatClipTime(0)).toBe('0:00');
        expect(formatClipTime(7.9)).toBe('0:07');
        expect(formatClipTime(62)).toBe('1:02');
        expect(formatClipTime(Number.NaN)).toBe('0:00');
        expect(formatClipTime(-3)).toBe('0:00');
    });
});
