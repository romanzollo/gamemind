/**
 * Отметка «Пауза на музыку» под таймером Блица / банком Выживания: значок
 * ноты, подпись и полоска, которая убывает за окно прослушивания.
 *
 * Статус не только цветом (DESIGN.md): есть слово и значок. Полоска — по
 * ширине из props, без CSS-анимации (гаснуть при reduced-motion нечему).
 * ADR: docs/DECISIONS.md → Audio questions: AUDIO_GUESS (listening window).
 */

import { AUDIO_LISTEN_WINDOW_SECONDS } from '@/features/quiz/lib/listening-window';

type ListeningPauseProps = {
    label: string;
    /** Сколько окна осталось, мс. */
    remainingMs: number;
};

export function ListeningPause({ label, remainingMs }: ListeningPauseProps) {
    const share = Math.max(
        0,
        Math.min(1, remainingMs / (AUDIO_LISTEN_WINDOW_SECONDS * 1000)),
    );
    return (
        <div className="mt-1.5" data-testid="listening-pause">
            <p className="flex items-center gap-1.5 font-mono text-2xs font-medium uppercase tracking-[0.14em] text-primary">
                <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
                    <path d="M9 17.5V6.2a1 1 0 0 1 .76-.97l9-2.2A1 1 0 0 1 20 4v11.5a3 3 0 1 1-2-2.83V8.3l-7 1.7v7.5a3 3 0 1 1-2-2.83Z" />
                </svg>
                {label}
            </p>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-muted">
                <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round(share * 100)}%` }}
                />
            </div>
        </div>
    );
}
