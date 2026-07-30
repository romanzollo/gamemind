/**
 * Глобальный Toaster (Sonner) для ephemeral-уведомлений.
 *
 * Почему Client Component: Sonner нужен portal + живой DOM на клиенте.
 * Почему в shared/ui: один bus на всё приложение (DECISIONS → Toast MVP).
 *
 * Тема:
 * - initial `theme` с SSR (cookie) для первого paint;
 * - дальше sync с `data-theme` (event + MutationObserver);
 * - Sonner CSS vars (--normal-bg и т.д.) перекинуты на токены GameMind,
 *   поэтому уже открытый toast меняет цвет при переключении темы
 *   (без этого Sonner залипает на #fff / #000).
 *
 * Do not: писать unlocks в БД; хардкодить RU/EN.
 */
'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Toaster } from 'sonner';

import {
    getDocumentTheme,
    THEME_CHANGE_EVENT,
    type ClientTheme,
} from '@/shared/ui/theme-client';

type AppToasterProps = {
    theme: ClientTheme;
};

/** Sonner internal tokens → Scoreboard Editorial (живут на data-theme). */
const sonnerTokenStyle = {
    '--normal-bg': 'var(--surface)',
    '--normal-bg-hover': 'var(--surface-hover)',
    '--normal-border': 'var(--border)',
    '--normal-border-hover': 'var(--border)',
    '--normal-text': 'var(--foreground)',
    '--gray1': 'var(--surface)',
    '--gray2': 'var(--surface-muted)',
    '--gray3': 'var(--surface-muted)',
    '--gray4': 'var(--border)',
    '--gray5': 'var(--border)',
    '--gray12': 'var(--foreground)',
    '--border-radius': 'var(--radius-md)',
} as CSSProperties;

export function AppToaster({ theme: initialTheme }: AppToasterProps) {
    const [theme, setTheme] = useState<ClientTheme>(initialTheme);

    useEffect(() => {
        const syncTheme = () => {
            setTheme(getDocumentTheme());
        };

        window.addEventListener(THEME_CHANGE_EVENT, syncTheme);

        const observer = new MutationObserver(syncTheme);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme'],
        });

        return () => {
            window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
            observer.disconnect();
        };
    }, []);

    return (
        <Toaster
            theme={theme}
            position="top-right"
            closeButton
            richColors={false}
            expand
            gap={12}
            visibleToasts={4}
            offset={{
                top: 'var(--site-header-sticky-offset, 4.5rem)',
                right: 16,
            }}
            mobileOffset={{
                top: 'var(--site-header-sticky-offset, 4.5rem)',
                right: 12,
                left: 12,
            }}
            style={sonnerTokenStyle}
            className="gm-toaster"
            toastOptions={{
                classNames: {
                    toast: 'gm-toast border border-border bg-surface text-foreground shadow-md font-sans',
                    title: 'font-display text-sm font-semibold tracking-tight text-foreground',
                    description: 'gm-toast-description text-xs text-muted',
                    actionButton:
                        'bg-primary text-primary-foreground hover:bg-primary-hover',
                    cancelButton:
                        'bg-surface-muted text-foreground border border-border',
                    closeButton:
                        'gm-toast-close border-border bg-surface text-muted hover:bg-surface-hover hover:text-foreground',
                    success: 'border-l-4 border-l-success',
                    error: 'border-l-4 border-l-danger',
                    info: 'border-l-4 border-l-info',
                    warning: 'border-l-4 border-l-warning',
                    icon: 'text-primary',
                },
            }}
        />
    );
}
