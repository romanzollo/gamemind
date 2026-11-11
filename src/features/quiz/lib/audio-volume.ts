/**
 * Громкость клипов AUDIO_GUESS на этом устройстве.
 *
 * Регулятор есть только там, где есть мышь (`QuestionAudio`): на телефоне
 * громкость — кнопки на корпусе, а iOS Safari свойство `volume` у `<audio>`
 * игнорирует. Значение общее для всех вопросов и режимов и живёт в
 * localStorage — это удобство устройства, не данные игрока: сервер о нём
 * не знает, сбой хранилища → громкость по умолчанию.
 *
 * Клипы уже выровнены к −18 LUFS (scripts/build-quiz-audio.ts), поэтому
 * по умолчанию 100 %.
 */

export type AudioVolumeSetting = {
    /** 0…1 — положение ползунка. */
    level: number;
    /** Выключено значком; положение ползунка при этом помнится. */
    muted: boolean;
};

export const AUDIO_VOLUME_STORAGE_KEY = 'gm_audio_volume';

export const DEFAULT_AUDIO_VOLUME: AudioVolumeSetting = { level: 1, muted: false };

function clampLevel(value: number): number {
    return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

/** Разбор сохранённой строки; мусор и чужой формат → значение по умолчанию. */
export function parseAudioVolume(raw: string | null): AudioVolumeSetting {
    if (!raw) return DEFAULT_AUDIO_VOLUME;
    try {
        const value: unknown = JSON.parse(raw);
        if (
            typeof value === 'object' &&
            value !== null &&
            'level' in value &&
            typeof value.level === 'number' &&
            Number.isFinite(value.level)
        ) {
            const muted = 'muted' in value && value.muted === true;
            return { level: clampLevel(value.level), muted };
        }
    } catch {
        // Битый JSON — как будто ничего не сохраняли.
    }
    return DEFAULT_AUDIO_VOLUME;
}

/** Громкость, которую получает `<audio>`. */
export function effectiveAudioVolume(setting: AudioVolumeSetting): number {
    return setting.muted ? 0 : setting.level;
}

/**
 * Новое положение ползунка. Сдвиг до нуля = «выключено»; сдвиг вверх из
 * выключенного состояния снова включает звук.
 */
export function withAudioLevel(level: number): AudioVolumeSetting {
    const next = clampLevel(level);
    return next === 0 ? { level: 0, muted: true } : { level: next, muted: false };
}

/**
 * Клик по значку. Включение из нуля возвращает слышимый уровень, иначе
 * значок «включил» бы тишину.
 */
export function toggleAudioMuted(setting: AudioVolumeSetting): AudioVolumeSetting {
    if (setting.muted || setting.level === 0) {
        return { level: setting.level > 0 ? setting.level : DEFAULT_AUDIO_VOLUME.level, muted: false };
    }
    return { ...setting, muted: true };
}

// --- Хранилище устройства (useSyncExternalStore) ---

const listeners = new Set<() => void>();
let cached: AudioVolumeSetting | null = null;

function readStorage(): AudioVolumeSetting {
    try {
        return parseAudioVolume(window.localStorage.getItem(AUDIO_VOLUME_STORAGE_KEY));
    } catch {
        return DEFAULT_AUDIO_VOLUME;
    }
}

export function subscribeAudioVolume(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
        if (event.key !== AUDIO_VOLUME_STORAGE_KEY) return;
        cached = null;
        listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
}

export function getAudioVolumeSnapshot(): AudioVolumeSetting {
    cached ??= readStorage();
    return cached;
}

export function getAudioVolumeServerSnapshot(): AudioVolumeSetting {
    return DEFAULT_AUDIO_VOLUME;
}

export function setAudioVolume(next: AudioVolumeSetting): void {
    cached = next;
    try {
        window.localStorage.setItem(AUDIO_VOLUME_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Приватный режим / запрет хранилища: громкость действует до перезагрузки.
    }
    listeners.forEach((listener) => listener());
}
