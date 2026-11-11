'use client';

/**
 * Звук вопросов AUDIO_GUESS: предзагрузка клипов и общий плеер партии.
 *
 * Предзагрузка (`useQuizAudioClips`): при открытии игры все клипы партии
 * скачиваются целиком (`fetch` → Blob → object URL), 2 повтора. iOS не
 * грузит медиа заранее по атрибуту `preload`, а клип в памяти больше не
 * зависит от сети — к его вопросу он играет сразу. Волну считаем тут же:
 * `decodeAudioData` на OfflineAudioContext (только декодирование, звук не
 * выводится — Web Audio на iPhone глушится беззвучным режимом).
 *
 * Плеер (`useQuizAudioPlayer`): один `HTMLAudioElement` на всю партию.
 * Safari на iOS разрешает программный `play()` только элементу, который уже
 * играл по жесту игрока, поэтому первый тап в игре «разблокирует» его
 * (80 мс тишины), а следующие клипы стартуют сами. `<audio>`, в отличие от
 * Web Audio, играет и при беззвучном режиме iPhone (WebKit).
 *
 * Только клиент. ADR: docs/DECISIONS.md → Audio questions: AUDIO_GUESS.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
    computeWaveformPeaks,
    placeholderWaveform,
} from '@/features/quiz/lib/quiz-audio-waveform';
import { QUIZ_AUDIO_SILENCE_DATA_URI } from '@/features/quiz/components/quiz-audio-silence';
import {
    effectiveAudioVolume,
    getAudioVolumeSnapshot,
    subscribeAudioVolume,
} from '@/features/quiz/lib/audio-volume';

export type QuizAudioClip =
    | { status: 'loading' }
    | { status: 'ready'; objectUrl: string; peaks: number[]; durationSeconds: number }
    | { status: 'error' };

/** Паузы перед повторами скачивания. */
const RETRY_DELAYS_MS = [700, 1800];
/** Одна попытка скачать клип (~160 КБ) не дольше этого. */
const FETCH_TIMEOUT_MS = 12_000;

const LOADING: QuizAudioClip = { status: 'loading' };

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchClipBlob(url: string): Promise<Blob> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        if (attempt > 0) {
            await sleep(RETRY_DELAYS_MS[attempt - 1]);
        }
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            // 404 — клипа нет (удалён по запросу): повтор не поможет.
            if (response.status === 404) {
                throw new Error('clip_missing');
            }
            if (!response.ok) {
                throw new Error(`clip_http_${response.status}`);
            }
            return await response.blob();
        } catch (error) {
            lastError = error;
            if (error instanceof Error && error.message === 'clip_missing') {
                break;
            }
        } finally {
            window.clearTimeout(timer);
        }
    }
    throw lastError instanceof Error ? lastError : new Error('clip_failed');
}

type OfflineContextCtor = new (
    channels: number,
    length: number,
    sampleRate: number,
) => OfflineAudioContext;

/** Волна и длина по байтам клипа; без Web Audio — заглушка. */
async function decodeClip(
    blob: Blob,
): Promise<{ peaks: number[]; durationSeconds: number }> {
    const Ctor: OfflineContextCtor | undefined =
        window.OfflineAudioContext ??
        (window as unknown as { webkitOfflineAudioContext?: OfflineContextCtor })
            .webkitOfflineAudioContext;
    if (!Ctor) {
        return { peaks: placeholderWaveform(), durationSeconds: 0 };
    }
    try {
        const context = new Ctor(1, 1, 44_100);
        const bytes = await blob.arrayBuffer();
        // Колбэки, а не промис: старый Safari знает только их.
        const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
            context.decodeAudioData(bytes, resolve, reject);
        });
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
            buffer.getChannelData(index),
        );
        return { peaks: computeWaveformPeaks(channels), durationSeconds: buffer.duration };
    } catch {
        return { peaks: placeholderWaveform(), durationSeconds: 0 };
    }
}

/**
 * Скачивает все клипы партии сразу. Ключ состояния — URL клипа.
 * `reload(url)` — повтор после ошибки (кнопка «Загрузить снова»).
 */
export function useQuizAudioClips(urls: ReadonlyArray<string | null | undefined>): {
    clips: Readonly<Record<string, QuizAudioClip>>;
    clipFor: (url: string | null | undefined) => QuizAudioClip | null;
    reload: (url: string) => void;
} {
    const [clips, setClips] = useState<Record<string, QuizAudioClip>>({});
    const startedRef = useRef(new Set<string>());
    const objectUrlsRef = useRef<string[]>([]);
    const aliveRef = useRef(true);

    const key = Array.from(
        new Set(urls.filter((url): url is string => typeof url === 'string' && url !== '')),
    ).join('\n');

    const load = useCallback((url: string) => {
        startedRef.current.add(url);
        void (async () => {
            try {
                const blob = await fetchClipBlob(url);
                const decoded = await decodeClip(blob);
                if (!aliveRef.current) return;
                const objectUrl = URL.createObjectURL(blob);
                objectUrlsRef.current.push(objectUrl);
                setClips((previous) => ({
                    ...previous,
                    [url]: { status: 'ready', objectUrl, ...decoded },
                }));
            } catch {
                if (!aliveRef.current) return;
                setClips((previous) => ({ ...previous, [url]: { status: 'error' } }));
            }
        })();
    }, []);

    useEffect(() => {
        aliveRef.current = true;
        if (!key) return;
        for (const url of key.split('\n')) {
            if (!startedRef.current.has(url)) {
                load(url);
            }
        }
    }, [key, load]);

    useEffect(() => {
        const objectUrls = objectUrlsRef.current;
        return () => {
            aliveRef.current = false;
            objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
        };
    }, []);

    const reload = useCallback(
        (url: string) => {
            setClips((previous) => ({ ...previous, [url]: LOADING }));
            load(url);
        },
        [load],
    );

    const clipFor = useCallback(
        (url: string | null | undefined): QuizAudioClip | null =>
            url ? (clips[url] ?? LOADING) : null,
        [clips],
    );

    return { clips, clipFor, reload };
}

export type QuizAudioPlayback = {
    /** object URL, который сейчас стоит в плеере. */
    src: string | null;
    playing: boolean;
    ended: boolean;
};

/**
 * `aborted` — запуск прервал наш же `pause()`/смена клипа (уход с вопроса,
 * двойной эффект React в dev). Это не отказ браузера: подсказку не показываем.
 */
export type QuizAudioPlayResult = 'playing' | 'blocked' | 'aborted' | 'failed';

const IDLE_PLAYBACK: QuizAudioPlayback = { src: null, playing: false, ended: false };

/**
 * Один `<audio>` на партию. Создаётся лениво в браузере; методы безопасно
 * звать до этого (ничего не делают). Состояние — через подписку
 * (`useSyncExternalStore`), время — `currentTime()` в кадре анимации.
 */
export class QuizAudioController {
    private audio: HTMLAudioElement | null = null;
    private unlocked = false;
    private playback: QuizAudioPlayback = IDLE_PLAYBACK;
    private readonly listeners = new Set<() => void>();

    attach(): () => void {
        if (this.audio || typeof window === 'undefined') {
            return () => undefined;
        }
        const audio = new Audio();
        audio.preload = 'auto';
        // iOS: без playsinline звук может уйти в системный плеер.
        audio.setAttribute('playsinline', '');
        const update = () => {
            if (audio.src === QUIZ_AUDIO_SILENCE_DATA_URI) return;
            this.set({
                src: this.playback.src,
                playing: !audio.paused && !audio.ended,
                ended: audio.ended,
            });
        };
        audio.addEventListener('play', update);
        audio.addEventListener('pause', update);
        audio.addEventListener('ended', update);
        this.audio = audio;
        return () => {
            audio.pause();
            audio.removeEventListener('play', update);
            audio.removeEventListener('pause', update);
            audio.removeEventListener('ended', update);
            audio.removeAttribute('src');
            this.audio = null;
            this.unlocked = false;
            this.set(IDLE_PLAYBACK);
        };
    }

    /** Звать в обработчике жеста (тап, клавиша): открывает автозапуск на iOS. */
    unlock(): void {
        const audio = this.audio;
        if (!audio || this.unlocked || this.playback.src) return;
        this.unlocked = true;
        audio.src = QUIZ_AUDIO_SILENCE_DATA_URI;
        audio.play().then(
            () => audio.pause(),
            () => {
                this.unlocked = false;
            },
        );
    }

    async play(src: string, options: { restart?: boolean } = {}): Promise<QuizAudioPlayResult> {
        const audio = this.audio;
        if (!audio) return 'failed';
        if (this.playback.src !== src) {
            audio.src = src;
            this.set({ src, playing: false, ended: false });
        } else if (options.restart || audio.ended) {
            audio.currentTime = 0;
        }
        try {
            await audio.play();
            return 'playing';
        } catch (error) {
            const name = error instanceof DOMException ? error.name : '';
            if (name === 'NotAllowedError') return 'blocked';
            if (name === 'AbortError') return 'aborted';
            return 'failed';
        }
    }

    pause(): void {
        this.audio?.pause();
    }

    /** 0…1. На iOS Safari не действует — там регулятор и не показываем. */
    setVolume(volume: number): void {
        if (this.audio) this.audio.volume = volume;
    }

    /** Остановить клип, если играет именно он (смена вопроса / уход со страницы). */
    stop(src: string): void {
        const audio = this.audio;
        if (!audio || this.playback.src !== src) return;
        audio.pause();
        this.set({ src: null, playing: false, ended: false });
    }

    currentTime(): number {
        return this.audio?.currentTime ?? 0;
    }

    duration(): number {
        const value = this.audio?.duration ?? 0;
        return Number.isFinite(value) ? value : 0;
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = (): QuizAudioPlayback => this.playback;

    private set(next: QuizAudioPlayback): void {
        const current = this.playback;
        if (
            current.src === next.src &&
            current.playing === next.playing &&
            current.ended === next.ended
        ) {
            return;
        }
        this.playback = next;
        this.listeners.forEach((listener) => listener());
    }
}

/**
 * Общий плеер партии. Первый `pointerdown` / `keydown` на странице
 * разблокирует звук (iOS); дальше клипы могут стартовать сами.
 */
export function useQuizAudioPlayer(enabled: boolean): QuizAudioController {
    const [controller] = useState(() => new QuizAudioController());

    useEffect(() => {
        if (!enabled) return;
        const detach = controller.attach();
        // Громкость устройства (регулятор в QuestionAudio, ADR AUDIO_GUESS → Loudness).
        const applyVolume = () =>
            controller.setVolume(effectiveAudioVolume(getAudioVolumeSnapshot()));
        applyVolume();
        const unsubscribeVolume = subscribeAudioVolume(applyVolume);
        const unlock = () => controller.unlock();
        document.addEventListener('pointerdown', unlock, { capture: true });
        document.addEventListener('keydown', unlock, { capture: true });
        return () => {
            document.removeEventListener('pointerdown', unlock, { capture: true });
            document.removeEventListener('keydown', unlock, { capture: true });
            unsubscribeVolume();
            detach();
        };
    }, [controller, enabled]);

    return controller;
}

/** Состояние воспроизведения для компонента. */
export function useQuizAudioPlayback(controller: QuizAudioController): QuizAudioPlayback {
    return useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => IDLE_PLAYBACK);
}
