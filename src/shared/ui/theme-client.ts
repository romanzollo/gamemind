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

/**
 * Подписка для useSyncExternalStore: `data-theme` на <html>.
 * ThemeToggle шлёт event, MutationObserver ловит прочие правки.
 * Серверный снимок у потребителя — тема из cookie (prop из layout):
 * тогда первый клиентский render совпадает с SSR, без hydration mismatch.
 */
export function subscribeDocumentTheme(onChange: () => void): () => void {
    window.addEventListener(THEME_CHANGE_EVENT, onChange);

    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
    });

    return () => {
        window.removeEventListener(THEME_CHANGE_EVENT, onChange);
        observer.disconnect();
    };
}

export function applyDocumentTheme(theme: ClientTheme): void {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('theme', theme);
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
    window.dispatchEvent(
        new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }),
    );
}
