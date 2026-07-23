import { createLocalPublicStorage } from '@/lib/storage/local-public';
import type { MediaStorage, StorageProvider } from '@/lib/storage/types';
import { createVercelBlobStorage } from '@/lib/storage/vercel-blob';

/**
 * Фабрика storage по STORAGE_PROVIDER.
 *
 * - vercel-blob — production / preview (нужны BLOB_* env)
 * - local-public — локальная разработка без Blob (пишет в public/media)
 * - yandex-s3 — fallback по ADR; реализация позже, пока явная ошибка
 *
 * Не вызывать из Client Components и не из startQuizAction.
 */
export function getMediaStorage(): MediaStorage {
    const provider = resolveStorageProvider();

    switch (provider) {
        case 'vercel-blob':
            return createVercelBlobStorage();
        case 'local-public':
            return createLocalPublicStorage();
        case 'yandex-s3':
            throw new Error(
                'STORAGE_PROVIDER=yandex-s3 is not implemented yet. Use vercel-blob or local-public.',
            );
        default: {
            const _exhaustive: never = provider;
            throw new Error(`Unknown STORAGE_PROVIDER: ${String(_exhaustive)}`);
        }
    }
}

function resolveStorageProvider(): StorageProvider {
    const raw = process.env.STORAGE_PROVIDER?.trim().toLowerCase();

    if (!raw) {
        // Без явного env: на Vercel — Blob, локально — public/media
        return process.env.VERCEL ? 'vercel-blob' : 'local-public';
    }

    if (raw === 'vercel-blob' || raw === 'yandex-s3' || raw === 'local-public') {
        return raw;
    }

    throw new Error(
        `Invalid STORAGE_PROVIDER="${raw}". Expected vercel-blob | yandex-s3 | local-public.`,
    );
}
