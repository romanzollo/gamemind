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

const nextConfig: NextConfig = {
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
    // sharp — native addon; не бандлить в serverless chunk (иначе upload падает на Vercel)
    serverExternalPackages: ['sharp'],
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

export default nextConfig;
