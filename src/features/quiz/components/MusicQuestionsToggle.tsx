'use client';

/**
 * Переключатель «Музыкальные вопросы» в шторках Классики, Блица и
 * Выживания. Один выбор на устройство (cookie `gm_music`): выключил в одной
 * шторке — выключено во всех (общий store через useSyncExternalStore).
 *
 * Не поле формы: выбор читает сам Server Action старта из cookie, поэтому
 * он действует и для «Продолжить», реванша и следующей волны.
 * Пока аудиовопросов в пуле нет, переключатель скрыт (AUDIO_QUESTIONS_IN_LOBBY).
 * ADR: docs/DECISIONS.md → AUDIO_GUESS → Mobile and «no sound».
 */

import { useId, useSyncExternalStore } from 'react';

import {
    AUDIO_QUESTIONS_IN_LOBBY,
    readBrowserMusicPreference,
    rememberMusicPreference,
    subscribeMusicPreference,
} from '@/features/quiz/lib/music-preference';

type MusicQuestionsToggleProps = {
    label: string;
    hint: string;
    /**
     * Значение cookie, прочитанное сервером при рендере главной. Серверный
     * снимок store: SSR и первый клиентский рендер совпадают, без мигания.
     */
    initialEnabled: boolean;
};

export function MusicQuestionsToggle({
    label,
    hint,
    initialEnabled,
}: MusicQuestionsToggleProps) {
    const enabled = useSyncExternalStore(
        subscribeMusicPreference,
        readBrowserMusicPreference,
        () => initialEnabled,
    );
    const labelId = useId();
    const hintId = useId();

    if (!AUDIO_QUESTIONS_IN_LOBBY) {
        return null;
    }

    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <p id={labelId} className="text-sm font-medium text-foreground">
                    {label}
                </p>
                <p id={hintId} className="mt-0.5 text-sm text-muted">
                    {hint}
                </p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-labelledby={labelId}
                aria-describedby={hintId}
                onClick={() => rememberMusicPreference(!enabled)}
                data-testid="music-questions-toggle"
                className="group inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
                <span
                    aria-hidden="true"
                    className={`relative inline-block h-7 w-12 rounded-full border transition-colors ${
                        enabled
                            ? 'border-primary bg-primary'
                            : 'border-border bg-surface-muted'
                    }`}
                >
                    <span
                        className={`absolute top-0.5 left-0.5 size-5.5 rounded-full bg-surface shadow-sm transition-transform motion-reduce:transition-none ${
                            enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                    />
                </span>
            </button>
        </div>
    );
}
