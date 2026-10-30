import { createHmac } from 'node:crypto';

import {
    MEDIA_PUBLIC_MOUNT,
    STORAGE_PREFIX,
    type StoragePrefix,
} from '@/lib/storage/types';

const QUIZ_MEDIA_OWNER_DOMAIN = 'gamemind:quiz-media-owner:v1';
const QUIZ_MEDIA_OWNER_LENGTH = 16;

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

/** Та же чистка idPart, что в buildStorageKey — для проверки владельца. */
function sanitizeStorageIdPart(idPart: string): string {
    return idPart.trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

/** crypto.randomUUID(): lowercase v4. */
const STORAGE_KEY_UUID_PATTERN =
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

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
    const idPart = sanitizeStorageIdPart(options.idPart);
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

/**
 * Принадлежит ли ключ владельцу (вопросу / пользователю).
 *
 * Зачем: перед delete заменённого объекта. URL в БД может указывать на
 * чужой `/media/...` (поле URL заполняется вручную) — без проверки замена
 * своей картинки удалила бы чужой файл.
 * Точное совпадение формата buildStorageKey, не startsWith: иначе id `q1`
 * совпал бы с ключами вопроса `q1-x` (`quiz/q1-x-<uuid>.webp`).
 */
export function isStorageKeyOwnedBy(
    key: string,
    owner: { prefix: StoragePrefix; idPart: string },
): boolean {
    const idPart = sanitizeStorageIdPart(owner.idPart);
    if (!idPart) {
        return false;
    }

    // idPart после чистки — только [a-zA-Z0-9_-]: экранировать для RegExp нечего.
    const pattern = new RegExp(
        `^${owner.prefix}/${idPart}-${STORAGE_KEY_UUID_PATTERN}\\.webp$`,
    );

    return pattern.test(key);
}

/**
 * Владелец PROMPT-картинки вопроса в ключе storage — непрозрачный.
 *
 * id импортированных IMAGE_GUESS читаемые (`img-med-bg3`): в URL
 * `/media/quiz/{id}-…` игрок увидел бы ответ. HMAC на AUTH_SECRET стабилен
 * для вопроса (по нему isStorageKeyOwnedBy узнаёт свою старую картинку при
 * замене), но обратно в id не переводится. Смена AUTH_SECRET → старые
 * объекты больше не «свои» и при замене остаются сиротами (безопасная сторона).
 * ADR: docs/DECISIONS.md → Quiz answer leak — opaque play ids.
 */
export function quizMediaOwner(
    questionId: string,
    secret?: string,
): { prefix: StoragePrefix; idPart: string } {
    const key = secret ?? process.env.AUTH_SECRET;
    if (!key) {
        throw new Error('AUTH_SECRET is required for quiz media keys');
    }

    const idPart = createHmac('sha256', key)
        .update(`${QUIZ_MEDIA_OWNER_DOMAIN}:${questionId}`)
        .digest('hex')
        .slice(0, QUIZ_MEDIA_OWNER_LENGTH);

    return { prefix: STORAGE_PREFIX.quiz, idPart };
}

/** Ключ для PROMPT-картинки вопроса (IMAGE_GUESS). */
export function buildQuizStorageKey(
    questionId: string,
    uuid: string,
    secret?: string,
): string {
    return buildStorageKey({ ...quizMediaOwner(questionId, secret), uuid });
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
