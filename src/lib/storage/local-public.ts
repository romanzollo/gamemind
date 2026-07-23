import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
 * Локальный провайдер для `next dev` без Blob-токена.
 *
 * Пишет в `public/media/{key}` — Next отдаёт файлы как статику по `/media/...`.
 * На Vercel ephemeral FS: для production используй vercel-blob, не local-public.
 *
 * Runtime-файлы в public/media не коммитим (.gitignore).
 */
export function createLocalPublicStorage(): MediaStorage {
    const mediaRoot = path.join(process.cwd(), 'public', 'media');

    return {
        provider: 'local-public',

        async put(input: PutObjectInput): Promise<PutObjectResult> {
            const key = normalizeStorageKey(input.key);
            const absolutePath = resolveUnderMediaRoot(mediaRoot, key);

            await mkdir(path.dirname(absolutePath), { recursive: true });
            await writeFile(absolutePath, input.body);

            return {
                key,
                publicUrl: publicUrlFromKey(key),
            };
        },

        async delete(input: DeleteObjectInput): Promise<void> {
            const key = normalizeStorageKey(input.key);
            const absolutePath = resolveUnderMediaRoot(mediaRoot, key);

            try {
                await unlink(absolutePath);
            } catch (error) {
                // Нет файла — ок для best-effort clear/replace
                if (
                    error &&
                    typeof error === 'object' &&
                    'code' in error &&
                    error.code === 'ENOENT'
                ) {
                    return;
                }
                throw error;
            }
        },

        publicUrl(key: string): string {
            return publicUrlFromKey(key);
        },
    };
}

/** path.resolve + проверка, что файл остаётся внутри public/media. */
function resolveUnderMediaRoot(mediaRoot: string, key: string): string {
    const root = path.resolve(mediaRoot);
    const absolutePath = path.resolve(root, key);
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

    if (absolutePath !== root && !absolutePath.startsWith(prefix)) {
        throw new Error('Local storage path escaped media root');
    }

    return absolutePath;
}
