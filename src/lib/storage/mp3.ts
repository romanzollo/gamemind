/**
 * Проверка и чистка клипа AUDIO_GUESS (MP3) без внешних зависимостей.
 *
 * Зачем: клип не должен выдавать ответ метаданными. Теги ID3v1/ID3v2/APE и
 * кадр Xing/Info/LAME вырезаем сами, а файл принимаем, только если после
 * чистки в нём остались одни аудиокадры MPEG Layer III — без «хвостов», где
 * мог бы спрятаться текст. Длину считаем по кадрам, а не по заголовку.
 *
 * Чистые функции над байтами: зовут скрипт конвейера клипов
 * (`scripts/build-quiz-audio.ts`) и позже — серверная загрузка в админке.
 * Не вызывать из клиента: работа над целым файлом нужна только при записи.
 *
 * ADR: docs/DECISIONS.md → Audio questions: AUDIO_GUESS.
 */

/** Границы клипа из ADR. По умолчанию 10 с ≈ 160 КБ. */
export const QUIZ_AUDIO_LIMITS = {
    minDurationMs: 4_000,
    maxDurationMs: 11_000,
    maxBytes: 300 * 1024,
} as const;

export type Mp3Inspection = {
    durationMs: number;
    frameCount: number;
    sampleRate: number;
    channels: 1 | 2;
    /** Средний битрейт по кадрам, кбит/с (округлённо). */
    bitrateKbps: number;
    byteLength: number;
};

export type Mp3Problem =
    | 'empty'
    | 'not_mpeg_audio'
    | 'trailing_bytes'
    | 'mixed_sample_rates'
    | 'too_short'
    | 'too_long'
    | 'too_large';

export type Mp3SanitizeResult =
    | { ok: true; bytes: Uint8Array; inspection: Mp3Inspection; removed: string[] }
    | { ok: false; problem: Mp3Problem; detail?: string };

const BITRATES_MPEG1_L3 = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const BITRATES_MPEG2_L3 = [
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const SAMPLE_RATES: Record<'1' | '2' | '2.5', number[]> = {
    '1': [44100, 48000, 32000],
    '2': [22050, 24000, 16000],
    '2.5': [11025, 12000, 8000],
};

type FrameHeader = {
    length: number;
    samples: number;
    sampleRate: number;
    bitrateKbps: number;
    channels: 1 | 2;
    /** Смещение начала side info + её длина: там лежит тег Xing/Info. */
    xingOffset: number;
};

/** Разбор 4 байт заголовка кадра Layer III; null — это не кадр. */
export function readMp3FrameHeader(
    bytes: Uint8Array,
    offset: number,
): FrameHeader | null {
    if (offset + 4 > bytes.length) {
        return null;
    }
    const b1 = bytes[offset + 1];
    const b2 = bytes[offset + 2];
    const b3 = bytes[offset + 3];
    if (bytes[offset] !== 0xff || (b1 & 0xe0) !== 0xe0) {
        return null;
    }

    const versionBits = (b1 >> 3) & 0b11;
    const layerBits = (b1 >> 1) & 0b11;
    if (versionBits === 0b01 || layerBits !== 0b01) {
        return null; // reserved version или не Layer III
    }
    const version = versionBits === 0b11 ? '1' : versionBits === 0b10 ? '2' : '2.5';

    const bitrateIndex = (b2 >> 4) & 0x0f;
    const sampleRateIndex = (b2 >> 2) & 0b11;
    if (bitrateIndex === 0 || bitrateIndex === 0x0f || sampleRateIndex === 0b11) {
        return null; // free format / bad / reserved
    }

    const isMpeg1 = version === '1';
    const bitrateKbps = (isMpeg1 ? BITRATES_MPEG1_L3 : BITRATES_MPEG2_L3)[
        bitrateIndex
    ];
    const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
    const padding = (b2 >> 1) & 1;
    const channels: 1 | 2 = ((b3 >> 6) & 0b11) === 0b11 ? 1 : 2;

    const length =
        Math.floor(((isMpeg1 ? 144 : 72) * bitrateKbps * 1000) / sampleRate) +
        padding;
    const sideInfo = isMpeg1
        ? channels === 1
            ? 17
            : 32
        : channels === 1
          ? 9
          : 17;

    return {
        length,
        samples: isMpeg1 ? 1152 : 576,
        sampleRate,
        bitrateKbps,
        channels,
        xingOffset: offset + 4 + sideInfo,
    };
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
    if (offset + text.length > bytes.length) {
        return false;
    }
    for (let index = 0; index < text.length; index += 1) {
        if (bytes[offset + index] !== text.charCodeAt(index)) {
            return false;
        }
    }
    return true;
}

/** Синхсейф-размер ID3v2 (по 7 бит на байт). */
function id3v2Size(bytes: Uint8Array, offset: number): number {
    const footer = (bytes[offset + 5] & 0x10) !== 0 ? 10 : 0;
    const size =
        ((bytes[offset + 6] & 0x7f) << 21) |
        ((bytes[offset + 7] & 0x7f) << 14) |
        ((bytes[offset + 8] & 0x7f) << 7) |
        (bytes[offset + 9] & 0x7f);
    return 10 + size + footer;
}

/** Срезает теги в начале и конце. Возвращает границы аудио и что убрали. */
function locateAudioBody(bytes: Uint8Array): {
    start: number;
    end: number;
    removed: string[];
} {
    const removed: string[] = [];
    let start = 0;
    let end = bytes.length;

    // ID3v2 в начале (их бывает несколько подряд).
    while (start + 10 <= end && asciiAt(bytes, start, 'ID3')) {
        start += id3v2Size(bytes, start);
        removed.push('id3v2');
    }

    // Хвост: ID3v1 (128 байт «TAG»), APEv2 (футер 32 байта «APETAGEX»),
    // ID3v2-футер «3DI». Повторяем, пока что-то снимается.
    let changed = true;
    while (changed && end > start) {
        changed = false;
        if (end - start >= 128 && asciiAt(bytes, end - 128, 'TAG')) {
            end -= 128;
            removed.push('id3v1');
            changed = true;
        }
        if (end - start >= 32 && asciiAt(bytes, end - 32, 'APETAGEX')) {
            const footer = end - 32;
            const tagSize =
                bytes[footer + 12] |
                (bytes[footer + 13] << 8) |
                (bytes[footer + 14] << 16) |
                (bytes[footer + 15] << 24);
            const hasHeader = (bytes[footer + 23] & 0x80) !== 0;
            end = Math.max(start, end - tagSize - (hasHeader ? 32 : 0));
            removed.push('ape');
            changed = true;
        }
        if (end - start >= 10 && asciiAt(bytes, end - 10, '3DI')) {
            end = Math.max(start, end - id3v2Size(bytes, end - 10));
            removed.push('id3v2-footer');
            changed = true;
        }
    }

    return { start: Math.min(start, end), end, removed };
}

/**
 * Чистит клип и проверяет его по правилам AUDIO_GUESS.
 * `limits: false` — только формат (для тестов и диагностики).
 */
export function sanitizeQuizMp3(
    input: Uint8Array,
    options: { limits?: boolean } = {},
): Mp3SanitizeResult {
    if (input.length === 0) {
        return { ok: false, problem: 'empty' };
    }

    const { start, end, removed } = locateAudioBody(input);
    const frames: Array<{ offset: number; header: FrameHeader }> = [];
    let offset = start;

    while (offset < end) {
        const header = readMp3FrameHeader(input, offset);
        if (!header) {
            return {
                ok: false,
                problem: frames.length === 0 ? 'not_mpeg_audio' : 'trailing_bytes',
                detail: `offset ${offset}`,
            };
        }
        if (offset + header.length > end) {
            return { ok: false, problem: 'trailing_bytes', detail: 'truncated frame' };
        }
        frames.push({ offset, header });
        offset += header.length;
    }

    if (frames.length === 0) {
        return { ok: false, problem: 'not_mpeg_audio' };
    }

    // Первый кадр Xing/Info (часто с «LAME3.100») — служебный, не звук.
    const first = frames[0];
    const xingAt = first.header.xingOffset;
    if (asciiAt(input, xingAt, 'Xing') || asciiAt(input, xingAt, 'Info')) {
        frames.shift();
        removed.push('xing');
    }

    if (frames.length === 0) {
        return { ok: false, problem: 'not_mpeg_audio' };
    }

    const sampleRate = frames[0].header.sampleRate;
    if (frames.some((frame) => frame.header.sampleRate !== sampleRate)) {
        return { ok: false, problem: 'mixed_sample_rates' };
    }

    const bodyStart = frames[0].offset;
    const bodyEnd = offset;
    const bytes = input.slice(bodyStart, bodyEnd);

    const totalSamples = frames.reduce((sum, frame) => sum + frame.header.samples, 0);
    const durationMs = Math.round((totalSamples / sampleRate) * 1000);
    const bitrateKbps = Math.round(
        frames.reduce((sum, frame) => sum + frame.header.bitrateKbps, 0) /
            frames.length,
    );

    const inspection: Mp3Inspection = {
        durationMs,
        frameCount: frames.length,
        sampleRate,
        channels: frames[0].header.channels,
        bitrateKbps,
        byteLength: bytes.length,
    };

    if (options.limits !== false) {
        if (durationMs < QUIZ_AUDIO_LIMITS.minDurationMs) {
            return { ok: false, problem: 'too_short', detail: `${durationMs} ms` };
        }
        if (durationMs > QUIZ_AUDIO_LIMITS.maxDurationMs) {
            return { ok: false, problem: 'too_long', detail: `${durationMs} ms` };
        }
        if (bytes.length > QUIZ_AUDIO_LIMITS.maxBytes) {
            return { ok: false, problem: 'too_large', detail: `${bytes.length} B` };
        }
    }

    return { ok: true, bytes, inspection, removed };
}
