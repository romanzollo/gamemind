/**
 * sitemap.xml (4.3c): страницы, которые имеет смысл находить поиском, —
 * главная и рейтинг на обоих языках, со ссылками RU ↔ EN (hreflang).
 * Новые разделы (фаза 6) добавляются сюда же.
 */

import type { MetadataRoute } from 'next';

import { SITE_ORIGIN } from '@/shared/config/site';
import { locales } from '@/shared/i18n';

const PUBLIC_PATHS = ['', '/leaderboard'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
    return PUBLIC_PATHS.flatMap((path) =>
        locales.map((locale) => ({
            url: `${SITE_ORIGIN}/${locale}${path}`,
            changeFrequency: 'daily' as const,
            priority: path === '' ? 1 : 0.6,
            alternates: {
                languages: Object.fromEntries(
                    locales.map((other) => [
                        other,
                        `${SITE_ORIGIN}/${other}${path}`,
                    ]),
                ),
            },
        })),
    );
}
