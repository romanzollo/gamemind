'use client';

import { useState } from 'react';

type Theme = 'light' | 'dark';

type ThemeToggleProps = {
    labels: {
        theme: string;
        light: string;
        dark: string;
        switchToLight: string;
        switchToDark: string;
    };
};

function getInitialTheme(): Theme {
    if (typeof document === 'undefined') {
        return 'light';
    }

    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('theme', theme);
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

export function ThemeToggle({ labels }: ThemeToggleProps) {
    const [theme, setTheme] = useState<Theme>(getInitialTheme);
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    const shortLabel = theme === 'dark' ? labels.dark : labels.light;

    return (
        <button
            type="button"
            suppressHydrationWarning
            onClick={() => {
                applyTheme(nextTheme);
                setTheme(nextTheme);
            }}
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
