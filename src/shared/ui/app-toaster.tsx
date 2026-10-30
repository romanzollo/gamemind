/**
 * Глобальный Toaster (Sonner) для ephemeral-уведомлений.
 *
 * Почему Client Component: Sonner нужен portal + живой DOM на клиенте.
 * Почему createPortal(document.body): sticky header / mobile menu (z-50) и
 * любые stacking-context предки не должны перекрывать toast — особенно на
 * узких экранах, где Sonner рисует full-width top strip под хедером.
 *
 * Тема: CSS vars → Scoreboard tokens + live `data-theme` sync.
 * Позиция: desktop (lg+) top-right; ниже lg — bottom-center (вне sticky chrome).
 *
 * Canon: DECISIONS → Toast Notifications MVP.
 */
'use client';

import { useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Toaster } from 'sonner';

import {
    getDocumentTheme,
    subscribeDocumentTheme,
    type ClientTheme,
} from '@/shared/ui/theme-client';
import { useHydrated } from '@/shared/ui/use-hydrated';

type AppToasterProps = {
    theme: ClientTheme;
};

/** Выше sticky header / mobile menu (z-50). */
export const TOASTER_Z_INDEX = 200;

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
    zIndex: TOASTER_Z_INDEX,
} as CSSProperties;

/** Совпадает с Tailwind `lg`: до desktop toast снизу, не под sticky chrome. */
const COMPACT_VIEWPORT_MQ = '(max-width: 1023px)';

function subscribeCompactViewport(onChange: () => void): () => void {
    const media = window.matchMedia(COMPACT_VIEWPORT_MQ);
    media.addEventListener('change', onChange);

    return () => media.removeEventListener('change', onChange);
}

function getCompactViewport(): boolean {
    return window.matchMedia(COMPACT_VIEWPORT_MQ).matches;
}

export function AppToaster({ theme: initialTheme }: AppToasterProps) {
    const hydrated = useHydrated();
    const theme = useSyncExternalStore<ClientTheme>(
        subscribeDocumentTheme,
        getDocumentTheme,
        () => initialTheme,
    );
    const isCompactViewport = useSyncExternalStore(
        subscribeCompactViewport,
        getCompactViewport,
        () => false,
    );

    if (!hydrated) {
        return null;
    }

    return createPortal(
        <Toaster
            theme={theme}
            position={isCompactViewport ? 'bottom-center' : 'top-right'}
            closeButton
            richColors={false}
            expand
            gap={12}
            visibleToasts={4}
            offset={{
                top: 'var(--site-header-sticky-offset, 4.5rem)',
                right: 16,
                bottom: 16,
            }}
            mobileOffset={{
                top: 'var(--site-header-sticky-offset, 4.5rem)',
                right: 12,
                left: 12,
                bottom: 'max(1rem, env(safe-area-inset-bottom))',
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
        />,
        document.body,
    );
}
