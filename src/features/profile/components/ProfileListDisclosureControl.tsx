/**
 * Кнопка progressive disclosure в складках профиля (ачивки / история).
 *
 * Scoreboard Editorial: mono uppercase, hairline + muted surface —
 * не primary CTA и не pill. Токены light/dark.
 */
'use client';

import type { MouseEvent } from 'react';

type ProfileListDisclosureControlProps = {
    /** expand = догрузить список; collapse = закрыть весь `<details>`. */
    kind: 'expand' | 'collapse';
    label: string;
    /** Для expand — раскрыть превью. */
    onExpand?: () => void;
    /** Для collapse — сбросить локальный preview state перед закрытием секции. */
    onCollapse?: () => void;
    className?: string;
};

const baseClassName = [
    'mt-2 flex w-full min-h-11 items-center justify-center gap-2',
    'border border-border bg-surface-muted/50 px-3 py-2.5',
    'font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-foreground',
    'motion-safe:transition-colors',
    'hover:bg-surface-muted',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
].join(' ');

/**
 * Закрывает ближайший `<details>` (секцию профиля) и сбрасывает скролл к summary.
 */
export function collapseNearestDetails(from: HTMLElement) {
    const details = from.closest('details');
    if (!details) {
        return;
    }

    details.open = false;
    details.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function ProfileListDisclosureControl({
    kind,
    label,
    onExpand,
    onCollapse,
    className = '',
}: ProfileListDisclosureControlProps) {
    function handleClick(event: MouseEvent<HTMLButtonElement>) {
        if (kind === 'collapse') {
            onCollapse?.();
            collapseNearestDetails(event.currentTarget);
            return;
        }

        onExpand?.();
    }

    return (
        <button
            type="button"
            className={[baseClassName, className].filter(Boolean).join(' ')}
            onClick={handleClick}
            aria-expanded={kind === 'expand' ? false : true}
        >
            <span>{label}</span>
            <span aria-hidden className="text-muted">
                {kind === 'expand' ? '↓' : '↑'}
            </span>
        </button>
    );
}
