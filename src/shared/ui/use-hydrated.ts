import { useSyncExternalStore } from 'react';

/**
 * `false` на SSR и в hydration-render, `true` сразу после гидрации.
 *
 * Для UI, который зависит от `Date.now()` / `window` / `document`
 * (countdown, portal): показываем placeholder, пока сервер и клиент
 * обязаны совпадать, и не держим `mounted`-state через setState в effect.
 *
 * Только из Client Components; импортировать напрямую, не через `@/shared/ui`.
 */

const subscribeNoop = () => () => {};

export function useHydrated(): boolean {
    return useSyncExternalStore(
        subscribeNoop,
        () => true,
        () => false,
    );
}
