'use client';

import { useSyncExternalStore } from 'react';

import {
    applyDocumentTheme,
    getDocumentTheme,
    subscribeDocumentTheme,
    type ClientTheme,
} from '@/shared/ui/theme-client';

type ThemeToggleProps = {
    labels: {
        theme: string;
        light: string;
        dark: string;
        switchToLight: string;
        switchToDark: string;
    };
    /**
     * Тема из cookie (layout). Серверный снимок для useSyncExternalStore:
     * SSR и первый клиентский render пишут одну подпись — без mismatch
     * «Light» на сервере / «Dark» в браузере при тёмной теме.
     */
    initialTheme: ClientTheme;
};

export function ThemeToggle({ labels, initialTheme }: ThemeToggleProps) {
    const theme = useSyncExternalStore<ClientTheme>(
        subscribeDocumentTheme,
        getDocumentTheme,
        () => initialTheme,
    );
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const shortLabel = theme === 'dark' ? labels.dark : labels.light;

    return (
        <button
            type="button"
            // applyDocumentTheme шлёт event → store перечитает data-theme.
            onClick={() => applyDocumentTheme(nextTheme)}
            className="rounded-md border border-border px-2 py-1 text-sm text-foreground transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3"
            aria-label={
                nextTheme === 'dark' ? labels.switchToDark : labels.switchToLight
            }
        >
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">
                {labels.theme}: {shortLabel}
            </span>
        </button>
    );
}
