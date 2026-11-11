'use client';

/**
 * Регулятор громкости клипа: значок динамика (выкл/вкл) + короткий ползунок.
 *
 * Только для устройств с мышью — класс `fine-pointer:flex` (globals.css):
 * на телефоне громкость — кнопки на корпусе, а iOS Safari свойство
 * `volume` у `<audio>` всё равно не меняет. Значение общее для всех
 * вопросов и режимов (`audio-volume.ts`), плеер подхватывает его сам.
 *
 * Не мешает ответу: окон нет, стрелки двигают ползунок только в его фокусе.
 */

import { useSyncExternalStore } from 'react';

import {
    effectiveAudioVolume,
    getAudioVolumeServerSnapshot,
    getAudioVolumeSnapshot,
    setAudioVolume,
    subscribeAudioVolume,
    toggleAudioMuted,
    withAudioLevel,
} from '@/features/quiz/lib/audio-volume';

type QuestionAudioVolumeProps = {
    labels: { volume: string; mute: string; unmute: string };
};

function VolumeIcon({ level }: { level: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" fill="currentColor" stroke="none" />
            {level === 0 ? (
                <path d="m16 9.5 5 5m0-5-5 5" />
            ) : (
                <>
                    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
                    {level >= 0.4 ? <path d="M18 7a7 7 0 0 1 0 10" /> : null}
                </>
            )}
        </svg>
    );
}

export function QuestionAudioVolume({ labels }: QuestionAudioVolumeProps) {
    const setting = useSyncExternalStore(
        subscribeAudioVolume,
        getAudioVolumeSnapshot,
        getAudioVolumeServerSnapshot,
    );
    const level = effectiveAudioVolume(setting);
    const percent = Math.round(level * 100);

    return (
        <div className="hidden shrink-0 fine-pointer:flex items-center gap-1.5">
            <button
                type="button"
                data-testid="quiz-audio-mute"
                onClick={() => setAudioVolume(toggleAudioMuted(setting))}
                aria-label={level === 0 ? labels.unmute : labels.mute}
                title={level === 0 ? labels.unmute : labels.mute}
                className="flex size-9 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:transition-colors"
            >
                <VolumeIcon level={level} />
            </button>
            <input
                type="range"
                data-testid="quiz-audio-volume"
                min={0}
                max={100}
                step={5}
                value={percent}
                onChange={(event) =>
                    setAudioVolume(withAudioLevel(Number(event.currentTarget.value) / 100))
                }
                aria-label={labels.volume}
                aria-valuetext={`${percent}%`}
                title={`${labels.volume}: ${percent}%`}
                className="h-1 w-20 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            />
        </div>
    );
}
