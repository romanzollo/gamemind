import {
    MEDIA_PUBLIC_MOUNT,
    STORAGE_PREFIX,
    type StoragePrefix,
} from '@/lib/storage/types';

/**
 * Нормализация и валидация object key.
 * Ключ — относительный путь внутри store, не URL и не путь с `..`.
 */
export function normalizeStorageKey(key: string): string {
    const trimmed = key.trim().replace(/^\/+/, '');

    if (!trimmed) {
        throw new Error('Storage key must not be empty');
    }

    if (trimmed.includes('..') || trimmed.includes('\\')) {
        throw new Error('Storage key must not contain path traversal');
    }

    if (trimmed.includes('://')) {
        throw new Error('Storage key must be a relative object key, not a URL');
    }

    return trimmed;
}

/**
 * Формат ключа: `{prefix}/{idPart}-{uuid}.webp`
 * uuid в имени даёт cache-bust при замене аватара/картинки.
 */
export function buildStorageKey(options: {
    prefix: StoragePrefix;
    idPart: string;
    uuid: string;
    extension?: 'webp';
}): string {
    const idPart = options.idPart.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const uuid = options.uuid.trim().replace(/[^a-zA-Z0-9-]/g, '');
    const extension = options.extension ?? 'webp';

    if (!idPart) {
        throw new Error('Storage key idPart must not be empty');
    }

    if (!uuid) {
        throw new Error('Storage key uuid must not be empty');
    }

    return normalizeStorageKey(
        `${options.prefix}/${idPart}-${uuid}.${extension}`,
    );
}

/** Ключ для PROMPT-картинки вопроса (IMAGE_GUESS). */
export function buildQuizStorageKey(questionIdOrSlug: string, uuid: string): string {
    return buildStorageKey({
        prefix: STORAGE_PREFIX.quiz,
        idPart: questionIdOrSlug,
        uuid,
    });
}

/** Ключ аватара пользователя. */
export function buildAvatarStorageKey(userId: string, uuid: string): string {
    return buildStorageKey({
        prefix: STORAGE_PREFIX.avatars,
        idPart: userId,
        uuid,
    });
}

/**
 * URL, который кладём в БД и отдаём в <img>.
 *
 * Пустой MEDIA_PUBLIC_BASE_URL → `/media/{key}` (относительный, same-origin).
 * MEDIA_PUBLIC_BASE_URL = origin сайта без `/media`, напр. https://www.game-mind.ru
 * → https://www.game-mind.ru/media/{key}
 */
export function publicUrlFromKey(key: string): string {
    const normalized = normalizeStorageKey(key);
    const path = `${MEDIA_PUBLIC_MOUNT}/${normalized}`;

    const origin = process.env.MEDIA_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
    if (!origin) {
        return path;
    }

    return `${origin}${path}`;
}

/**
 * Обратное к publicUrlFromKey для delete при replace/clear аватара.
 * Legacy `/quiz-images/...` и чужие HTTPS → null (через storage не удаляем).
 */
export function storageKeyFromPublicUrl(publicUrl: string): string | null {
    const value = publicUrl.trim();
    if (!value) {
        return null;
    }

    try {
        if (value.startsWith('http://') || value.startsWith('https://')) {
            const pathname = new URL(value).pathname;
            return storageKeyFromPublicPath(pathname);
        }
    } catch {
        return null;
    }

    return storageKeyFromPublicPath(value);
}

function storageKeyFromPublicPath(pathname: string): string | null {
    const mount = `${MEDIA_PUBLIC_MOUNT}/`;
    const path = pathname.startsWith('/') ? pathname : `/${pathname}`;

    if (!path.startsWith(mount)) {
        return null;
    }

    try {
        return normalizeStorageKey(path.slice(mount.length));
    } catch {
        return null;
    }
}
