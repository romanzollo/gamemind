/**
 * Одна строка настроек профиля: название слева, текущее значение справа,
 * форма раскрывается по нажатию (свой `<details>`).
 *
 * Client: `<details>` должен пережить RSC refresh после Server Action (как
 * ProfileSettingsSection) — иначе строка схлопнется сразу после сохранения.
 */
'use client';

import type { ReactNode } from 'react';

type ProfileSettingsRowProps = {
    title: string;
    /** Текущее значение: ник, мини-аватар, «Задан», список входов. */
    value: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
    testId?: string;
};

export function ProfileSettingsRow({
    title,
    value,
    children,
    defaultOpen = false,
    testId,
}: ProfileSettingsRowProps) {
    return (
        <details
            open={defaultOpen}
            className="group/row border-b border-border last:border-b-0"
            data-testid={testId}
        >
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring motion-safe:transition-colors [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-foreground sm:text-base">
                    {title}
                </span>
                <span className="ml-auto flex min-w-0 items-center gap-2 text-sm text-muted">
                    <span className="flex min-w-0 items-center truncate">{value}</span>
                    <span
                        aria-hidden
                        className="shrink-0 motion-safe:transition-transform group-open/row:rotate-90"
                    >
                        ›
                    </span>
                </span>
            </summary>
            <div className="px-4 pb-4">{children}</div>
        </details>
    );
}
