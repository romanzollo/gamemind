/**
 * Unit-тесты разделов навигации: какая вкладка подсвечена и где панель прячется.
 */

import { describe, expect, it } from 'vitest';

import { getDictionary } from '@/shared/i18n';
import { getSiteSection, getSiteTabs, isGameScreen } from './site-nav';

describe('getSiteSection', () => {
    it('считает главную, лобби, партию и результат разделом «Играть»', () => {
        expect(getSiteSection('/ru')).toBe('play');
        expect(getSiteSection('/en/quiz')).toBe('play');
        expect(getSiteSection('/ru/quiz/abc123')).toBe('play');
        expect(getSiteSection('/ru/result/abc123')).toBe('play');
    });

    it('относит вход и регистрацию к «Профилю»', () => {
        expect(getSiteSection('/ru/profile')).toBe('profile');
        expect(getSiteSection('/ru/login')).toBe('profile');
        expect(getSiteSection('/en/register')).toBe('profile');
    });

    it('не путает похожие префиксы и не подсвечивает админку', () => {
        expect(getSiteSection('/ru/leaderboard')).toBe('leaderboard');
        expect(getSiteSection('/ru/quizzes')).toBeNull();
        expect(getSiteSection('/ru/admin/questions')).toBeNull();
    });
});

describe('isGameScreen', () => {
    it('прячет панель только на экране партии', () => {
        expect(isGameScreen('/ru/quiz/abc123')).toBe(true);
        expect(isGameScreen('/ru/quiz')).toBe(false);
        expect(isGameScreen('/ru/result/abc123')).toBe(false);
    });
});

describe('getSiteTabs', () => {
    const nav = getDictionary('ru').nav;

    it('ведёт посетителя без сессии из «Профиля» на вход', () => {
        const profile = getSiteTabs(nav, false).find(
            (tab) => tab.section === 'profile',
        );

        expect(profile?.href).toBe('/login');
    });

    it('даёт игроку три вкладки в порядке Играть / Рейтинг / Профиль', () => {
        expect(getSiteTabs(nav, true).map((tab) => tab.href)).toEqual([
            '/',
            '/leaderboard',
            '/profile',
        ]);
    });
});
