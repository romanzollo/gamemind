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

    return (
        <button
            type="button"
            suppressHydrationWarning
            onClick={() => {
                applyTheme(nextTheme);
                setTheme(nextTheme);
            }}
            className="rounded border border-(--border) px-3 py-1 text-sm text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:outline-neutral-100"
            aria-label={
                nextTheme === 'dark' ? labels.switchToDark : labels.switchToLight
            }
        >
            {labels.theme}: {theme === 'dark' ? labels.dark : labels.light}
        </button>
    );
}
