/**
 * robots.txt (4.3c): публичное — главная, рейтинг, вход — открыто для
 * поисковиков; служебное и личное закрыто. Экран партии (`/quiz/…`)
 * закрыт: это чужая сессия, а не страница. Результаты (`/result/…`) не
 * закрываем — по этим ссылкам мессенджеры строят превью «Поделиться».
 */

import type { MetadataRoute } from 'next';

import { SITE_ORIGIN } from '@/shared/config/site';
import { locales } from '@/shared/i18n';

export default function robots(): MetadataRoute.Robots {
    const privatePaths = locales.flatMap((locale) => [
        `/${locale}/admin`,
        `/${locale}/profile`,
        `/${locale}/quiz/`,
    ]);

    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/api/', ...privatePaths],
        },
        sitemap: `${SITE_ORIGIN}/sitemap.xml`,
        host: SITE_ORIGIN,
    };
}
