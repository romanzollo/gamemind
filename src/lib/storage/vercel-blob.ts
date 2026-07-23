import { del, put } from '@vercel/blob';

import {
    normalizeStorageKey,
    publicUrlFromKey,
} from '@/lib/storage/paths';
import type {
    DeleteObjectInput,
    MediaStorage,
    PutObjectInput,
    PutObjectResult,
} from '@/lib/storage/types';

/**
 * Провайдер Vercel Blob (primary по ADR RU-first).
 *
 * В БД кладём same-origin `/media/{key}`, а не `*.blob.vercel-storage.com`.
 * Браузер ходит на game-mind.ru; Next rewrite проксирует на Blob
 * (см. next.config.ts + BLOB_PUBLIC_BASE_URL).
 *
 * Токен: BLOB_READ_WRITE_TOKEN (Vercel Storage → Blob → token).
 *
 * На Vercel SSR `put` → fetch/undici отвергает body, чей backing store —
 * SharedArrayBuffer (часто так отдаёт sharp Buffer). `Uint8Array.from(buf)`
 * оказался недостаточным в бандле; копируем в свежий `ArrayBuffer` + Blob.
 */
function toSafePutBody(buffer: Buffer, contentType: string): Blob {
    const ab = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(ab).set(buffer);
    return new Blob([ab], { type: contentType });
}

export function createVercelBlobStorage(): MediaStorage {
    return {
        provider: 'vercel-blob',

        async put(input: PutObjectInput): Promise<PutObjectResult> {
            const key = normalizeStorageKey(input.key);
            const token = process.env.BLOB_READ_WRITE_TOKEN;

            // Явный token: не полагаемся только на OIDC auto-detect
            // (fallback нужен, если VERCEL_OIDC_TOKEN недоступен в runtime).
            await put(key, toSafePutBody(input.body, input.contentType), {
                access: 'public',
                addRandomSuffix: false,
                contentType: input.contentType,
                ...(token ? { token } : {}),
                // uuid уже в ключе — не даём SDK дописывать суффикс
            });

            return {
                key,
                publicUrl: publicUrlFromKey(key),
            };
        },

        async delete(input: DeleteObjectInput): Promise<void> {
            const key = normalizeStorageKey(input.key);
            const token = process.env.BLOB_READ_WRITE_TOKEN;
            // SDK принимает pathname или полный Blob URL
            await del(key, token ? { token } : undefined);
        },

        publicUrl(key: string): string {
            return publicUrlFromKey(key);
        },
    };
}
