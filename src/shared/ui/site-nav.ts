/**
 * Разделы сайта для навигации: нижняя панель на телефоне и пункты шапки
 * на широком экране (П11, решение владельца 2 ноя — три пункта).
 *
 * Чистые функции без React: их читают и Server Layout (список вкладок),
 * и клиентская панель (активная вкладка по pathname).
 */

import { removeLocaleFromPathname, type Dictionary } from '@/shared/i18n';

/** Три места, куда игрок возвращается. Админка — не раздел, а пункт шапки. */
export type SiteSection = 'play' | 'leaderboard' | 'profile';

export type SiteTab = {
    section: SiteSection;
    /** Путь без локали. */
    href: string;
    label: string;
};

/**
 * Вкладки в порядке показа. У посетителя без сессии «Профиль» ведёт на вход:
 * там же «Играть без регистрации», так что вкладка не тупик.
 */
export function getSiteTabs(
    nav: Dictionary['nav'],
    signedIn: boolean,
): ReadonlyArray<SiteTab> {
    return [
        { section: 'play', href: '/', label: nav.quiz },
        { section: 'leaderboard', href: '/leaderboard', label: nav.leaderboard },
        {
            section: 'profile',
            href: signedIn ? '/profile' : '/login',
            label: nav.profile,
        },
    ];
}

function isPathWithin(current: string, base: string): boolean {
    return current === base || current.startsWith(`${base}/`);
}

/**
 * Какую вкладку подсветить. «Играть» — главная (место игры), партия и
 * результат: для игрока это один поток «выбрал → сыграл → посмотрел итог».
 * Вход и регистрация — «Профиль», потому что вкладка посетителя ведёт туда.
 */
export function getSiteSection(pathname: string): SiteSection | null {
    const current = removeLocaleFromPathname(pathname);

    if (
        current === '/' ||
        isPathWithin(current, '/quiz') ||
        isPathWithin(current, '/result')
    ) {
        return 'play';
    }

    if (isPathWithin(current, '/leaderboard')) {
        return 'leaderboard';
    }

    if (
        isPathWithin(current, '/profile') ||
        isPathWithin(current, '/login') ||
        isPathWithin(current, '/register')
    ) {
        return 'profile';
    }

    return null;
}

/**
 * Экран партии `/quiz/:sessionId`. Нижнюю панель здесь не показываем:
 * случайное касание не должно уводить из игры, а низ экрана занят кнопкой
 * ответа и плашкой реакции.
 */
export function isGameScreen(pathname: string): boolean {
    return removeLocaleFromPathname(pathname).startsWith('/quiz/');
}
