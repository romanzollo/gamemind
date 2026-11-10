import { describe, expect, it } from 'vitest';

import { readMp3FrameHeader, sanitizeQuizMp3 } from '@/lib/storage/mp3';

// MPEG-1 Layer III, 128 кбит/с, 44,1 кГц, без padding, joint stereo.
const HEADER = [0xff, 0xfb, 0x90, 0x64];
const FRAME_LENGTH = 417; // floor(144 × 128000 / 44100)
const SAMPLES_PER_FRAME = 1152;

function frame(fill = 0): number[] {
    return [...HEADER, ...new Array<number>(FRAME_LENGTH - 4).fill(fill)];
}

/** Кадр Xing: тег сразу после side info (32 байта у MPEG-1 stereo). */
function xingFrame(): number[] {
    const bytes = frame();
    const tag = 'Info....LAME3.100';
    for (let index = 0; index < tag.length; index += 1) {
        bytes[4 + 32 + index] = tag.charCodeAt(index);
    }
    return bytes;
}

function frames(count: number): number[] {
    return Array.from({ length: count }, () => frame()).flat();
}

function ascii(text: string): number[] {
    return [...text].map((char) => char.charCodeAt(0));
}

/** ID3v2.3 с одним текстовым полем «Skyrim» — ровно то, что может выдать ответ. */
function id3v2(): number[] {
    const body = [...ascii('TIT2'), 0, 0, 0, 7, 0, 0, 0, ...ascii('Skyrim')];
    return [...ascii('ID3'), 3, 0, 0, 0, 0, 0, body.length, ...body];
}

function id3v1(): number[] {
    return [...ascii('TAG'), ...new Array<number>(125).fill(0x41)];
}

const framesFor8s = Math.ceil((8 * 44100) / SAMPLES_PER_FRAME); // 307

describe('readMp3FrameHeader', () => {
    it('reads a 128 kbps 44.1 kHz stereo frame', () => {
        const header = readMp3FrameHeader(new Uint8Array(frame()), 0);
        expect(header).toMatchObject({
            length: FRAME_LENGTH,
            samples: SAMPLES_PER_FRAME,
            sampleRate: 44100,
            bitrateKbps: 128,
            channels: 2,
        });
    });

    it('rejects non-frames', () => {
        expect(readMp3FrameHeader(new Uint8Array([0x49, 0x44, 0x33, 0]), 0)).toBeNull();
    });
});

describe('sanitizeQuizMp3', () => {
    it('accepts clean frames and measures the duration', () => {
        const result = sanitizeQuizMp3(new Uint8Array(frames(framesFor8s)));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.inspection.frameCount).toBe(framesFor8s);
        expect(result.inspection.durationMs).toBe(
            Math.round(((framesFor8s * SAMPLES_PER_FRAME) / 44100) * 1000),
        );
        expect(result.inspection.bitrateKbps).toBe(128);
        expect(result.removed).toEqual([]);
    });

    it('strips ID3v2, ID3v1 and the Xing frame', () => {
        const input = new Uint8Array([
            ...id3v2(),
            ...xingFrame(),
            ...frames(framesFor8s),
            ...id3v1(),
        ]);
        const result = sanitizeQuizMp3(input);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.removed).toEqual(['id3v2', 'id3v1', 'xing']);
        expect(result.bytes).toEqual(new Uint8Array(frames(framesFor8s)));
        expect(Buffer.from(result.bytes).includes('Skyrim')).toBe(false);
        expect(Buffer.from(result.bytes).includes('LAME')).toBe(false);
    });

    it('strips an APEv2 tag at the end', () => {
        const apeBody = ascii('TitleSkyrim');
        const footer = [
            ...ascii('APETAGEX'),
            0xd0, 0x07, 0, 0, // version 2000
            apeBody.length + 32, 0, 0, 0, // size = items + footer
            1, 0, 0, 0, // item count
            0, 0, 0, 0, // flags: no header
            ...new Array<number>(8).fill(0),
        ];
        const result = sanitizeQuizMp3(
            new Uint8Array([...frames(framesFor8s), ...apeBody, ...footer]),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.removed).toEqual(['ape']);
        expect(result.bytes.length).toBe(framesFor8s * FRAME_LENGTH);
    });

    it('refuses bytes after the last frame (a place to hide text)', () => {
        const result = sanitizeQuizMp3(
            new Uint8Array([...frames(framesFor8s), ...ascii('answer: Skyrim')]),
        );
        expect(result).toMatchObject({ ok: false, problem: 'trailing_bytes' });
    });

    it('refuses something that is not MPEG audio', () => {
        expect(sanitizeQuizMp3(new Uint8Array(ascii('RIFF....WAVEfmt ')))).toMatchObject({
            ok: false,
            problem: 'not_mpeg_audio',
        });
        expect(sanitizeQuizMp3(new Uint8Array())).toMatchObject({
            ok: false,
            problem: 'empty',
        });
    });

    it('applies the clip length limits from the ADR', () => {
        expect(sanitizeQuizMp3(new Uint8Array(frames(100)))).toMatchObject({
            ok: false,
            problem: 'too_short',
        });
        expect(sanitizeQuizMp3(new Uint8Array(frames(500)))).toMatchObject({
            ok: false,
            problem: 'too_long',
        });
        expect(
            sanitizeQuizMp3(new Uint8Array(frames(100)), { limits: false }).ok,
        ).toBe(true);
    });
});
