/**
 * Клиентская тема (light/dark) без полного reload.
 *
 * Layout читает cookie на SSR; ThemeToggle меняет `data-theme` на <html>.
 * AppToaster и другие client islands слушают `THEME_CHANGE_EVENT` /
 * MutationObserver, чтобы не залипать на initial prop (Sonner иначе
 * держит --normal-bg:#fff/#000 до remount).
 */

export type ClientTheme = 'light' | 'dark';

export const THEME_CHANGE_EVENT = 'gamemind:theme';

export function getDocumentTheme(): ClientTheme {
    if (typeof document === 'undefined') {
        return 'light';
    }

    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyDocumentTheme(theme: ClientTheme): void {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('theme', theme);
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
    window.dispatchEvent(
        new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }),
    );
}
