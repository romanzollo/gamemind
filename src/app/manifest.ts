/**
 * Веб-манифест: название и иконка, когда сайт добавляют на главный экран
 * телефона («Установить» / «На экран Домой»). Офлайна и service worker нет —
 * только ярлык со знаком GameMind.
 * Иконки собирает scripts/build-favicon.cjs из src/app/icon.svg.
 * Цвета — тёмная тема (как плитка знака). Canon: DECISIONS → Brand mark: answer grid.
 */

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'GameMind',
        short_name: 'GameMind',
        start_url: '/',
        display: 'standalone',
        background_color: '#16191f',
        theme_color: '#16191f',
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
    };
}
