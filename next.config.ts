import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

/**
 * BLOB_PUBLIC_BASE_URL — origin Blob store без trailing slash,
 * напр. https://xxxxx.public.blob.vercel-storage.com
 * (хост из URL после первого put в Vercel Storage UI / SDK).
 *
 * Rewrite: браузер → /media/{key} на game-mind.ru → объект в Blob.
 * Seed IMAGE_GUESS остаётся на /quiz-images/ (public/), rewrite не трогает.
 */
const blobPublicBase = process.env.BLOB_PUBLIC_BASE_URL?.trim().replace(
    /\/+$/,
    '',
);

/**
 * Native libvips для sharp на Vercel (linux-x64, glibc).
 *
 * `@img/sharp-linux-x64/*.node` грузит `libvips-cpp.so.*` через dlopen по
 * RPATH — file tracing (nft) этого не видит, .so не попадал в функцию:
 * "libvips-cpp.so.8.x: cannot open shared object file" → 500 на admin edit.
 * На Windows/macOS этих пакетов нет в node_modules — glob просто пустой.
 */
const SHARP_LINUX_NATIVE_FILES = [
    './node_modules/@img/sharp-linux-x64/**/*',
    './node_modules/@img/sharp-libvips-linux-x64/**/*',
];

const nextConfig: NextConfig = {
    /**
     * Только маршруты, чьи Server Actions делают upload (admin questions,
     * avatar в profile): +~15 МБ libvips не нужны функциям quiz hot path.
     * Ключ — picomatch по route без групп: `/[locale]/admin/questions/[id]/edit`.
     */
    outputFileTracingIncludes: {
        '/*/admin/questions/**': SHARP_LINUX_NATIVE_FILES,
        '/*/profile': SHARP_LINUX_NATIVE_FILES,
    },
    /**
     * В Next 16.2 bodySizeLimit живёт в experimental.serverActions
     * (top-level serverActions конфиг отвергает как unrecognized).
     * Дефолт = 1 MB; наш upload allowlist = 2 MB + запас на multipart.
     */
    experimental: {
        serverActions: {
            bodySizeLimit: '3mb',
        },
    },
    // Native / Node fetch: не бандлить в SSR chunk (иначе Blob put ловит SharedArrayBuffer).
    // pg — тоже external: Turbopack-бандл коррелировал с TLS hang к Neon в next dev.
    serverExternalPackages: ['sharp', '@vercel/blob', 'pg'],
    images: {
        // Dev seed uses SVG placeholders from public/quiz-images/.
        dangerouslyAllowSVG: true,
        contentDispositionType: 'attachment',
        contentSecurityPolicy:
            "default-src 'self'; script-src 'none'; sandbox;",
        // Production: store files in object storage; DB keeps HTTPS/same-origin URLs only.
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '*.public.blob.vercel-storage.com',
            },
            // Legacy / demoted providers — keep allowlist if old absolute URLs exist
            {
                protocol: 'https',
                hostname: '*.r2.dev',
            },
            {
                protocol: 'https',
                hostname: '*.supabase.co',
                pathname: '/storage/v1/object/public/**',
            },
        ],
    },
    async rewrites() {
        if (!blobPublicBase) {
            return [];
        }

        return [
            {
                source: '/media/:path*',
                destination: `${blobPublicBase}/:path*`,
            },
        ];
    },
};

/**
 * Sentry (ADR: DECISIONS → Error monitoring: Sentry EU) — только ошибки.
 *
 * - `tunnelRoute` `/api/m`: браузер шлёт события на наш домен, handler
 *   `src/app/sentry-tunnel/route.ts` пересылает их в Sentry без IP/cookie.
 *   Под `/api` — proxy.ts его не трогает (matcher исключает `api`);
 *   короткое нейтральное имя реже попадает в списки блокировщиков.
 * - `excludeTracing` + без `tracesSampleRate` в init: tracing вырезан из
 *   бандла. Включать tracing — отдельным шагом с замером горячего пути.
 * - `buildTimeInstrumentation: false`: сборка не оборачивает серверные
 *   зависимости (pg и др.) — пока tracing нет, это лишний риск для Neon.
 * - `routeManifestInjection: false`: карта маршрутов нужна только для имён
 *   транзакций tracing, а в клиентский бандл она добавляла килобайты.
 * - Source maps не грузим (нужен секретный токен) — отдельный подшаг.
 * - В браузере SDK грузится лениво после `load` (sentry-browser.ts).
 */
export default withSentryConfig(nextConfig, {
    tunnelRoute: '/api/m',
    sourcemaps: { disable: true },
    buildTimeInstrumentation: false,
    routeManifestInjection: false,
    bundleSizeOptimizations: {
        excludeDebugStatements: true,
        excludeTracing: true,
        excludeReplayIframe: true,
        excludeReplayShadowDom: true,
        excludeReplayWorker: true,
    },
    suppressOnRouterTransitionStartWarning: true,
    telemetry: false,
    silent: !process.env.CI,
});
