/**
 * Волна клипа AUDIO_GUESS и формат времени плеера — чистые функции.
 *
 * Зачем: волну рисуем как у голосовых сообщений (≈40 столбиков) из уже
 * скачанного клипа, на устройстве. В снапшот и в БД ничего не кладём —
 * так в снапшоте остаётся только URL (ADR «Audio questions: AUDIO_GUESS»).
 * Декодирование (Web Audio, без вывода звука) живёт в хуке плеера; здесь
 * только математика над сэмплами, чтобы её можно было проверить тестом.
 */

/** Сколько столбиков в волне плеера. */
export const QUIZ_AUDIO_WAVEFORM_BARS = 40;

/** Минимальная высота столбика (доля): тихие места не исчезают совсем. */
const MIN_BAR = 0.12;

/**
 * RMS по корзинам, максимум по каналам, нормировка к самому громкому.
 * Пустой вход → ровная «заглушка» средней высоты.
 */
export function computeWaveformPeaks(
    channels: readonly Float32Array[],
    bars: number = QUIZ_AUDIO_WAVEFORM_BARS,
): number[] {
    const length = channels[0]?.length ?? 0;
    if (length === 0 || bars <= 0) {
        return placeholderWaveform(bars);
    }

    const bucketSize = Math.max(1, Math.floor(length / bars));
    const raw: number[] = [];

    for (let bar = 0; bar < bars; bar += 1) {
        const start = bar * bucketSize;
        const end = bar === bars - 1 ? length : Math.min(length, start + bucketSize);
        let loudest = 0;
        for (const channel of channels) {
            let sum = 0;
            for (let index = start; index < end; index += 1) {
                const sample = channel[index] ?? 0;
                sum += sample * sample;
            }
            const rms = end > start ? Math.sqrt(sum / (end - start)) : 0;
            loudest = Math.max(loudest, rms);
        }
        raw.push(loudest);
    }

    const max = Math.max(...raw);
    if (max <= 0) {
        return raw.map(() => MIN_BAR);
    }
    return raw.map((value) =>
        Math.round((MIN_BAR + (1 - MIN_BAR) * (value / max)) * 1000) / 1000,
    );
}

/** Ровная волна для загрузки / ошибки декодирования. */
export function placeholderWaveform(
    bars: number = QUIZ_AUDIO_WAVEFORM_BARS,
): number[] {
    return Array.from({ length: Math.max(0, bars) }, () => 0.35);
}

/** «0:07», «1:02». Отрицательное и NaN → «0:00». */
export function formatClipTime(seconds: number): string {
    const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const minutes = Math.floor(safe / 60);
    const rest = safe % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
}
