/**
 * Фото из внешнего входа → свой аватар в media storage.
 *
 * Ссылки VK ID на фото (`*.userapi.com/s/v1/...`) живут недолго: через
 * какое-то время отдают 404, и в шапке остаётся пустой кружок. Поэтому
 * при входе, пока ссылка свежая, скачиваем фото, ужимаем тем же конвейером,
 * что и загрузку в профиле (квадрат WebP), и храним свой `/media/avatars/...`.
 * Яндекс отдаёт постоянную ссылку — его фото не копируем.
 *
 * Любая ошибка — не ошибка входа: игрок просто остаётся без аватара.
 * Только сервер (sharp, storage). Canon: DECISIONS → Accounts without a password.
 */

import { randomUUID } from 'node:crypto';

import { userRepository } from '@/entities/user/user.repository';
import {
    assertAllowedImageMime,
    buildAvatarStorageKey,
    getMediaStorage,
    MEDIA_UPLOAD_MAX_BYTES,
    processAvatarToWebp,
} from '@/lib/storage';

/** Хосты, чьи ссылки на фото протухают и которые мы копируем к себе. */
const IMPORTED_AVATAR_HOSTS = ['userapi.com', 'vk.com', 'vk.ru'];

/** Сколько ждём фото: вход не должен висеть из-за картинки. */
const AVATAR_FETCH_TIMEOUT_MS = 5_000;

/**
 * Ссылка на фото, которое надо скопировать к себе. Список хостов ещё и
 * защищает от запросов сервера на произвольные адреса.
 */
export function isImportedAvatarUrl(
    url: string | null | undefined,
): url is string {
    if (!url) return false;

    try {
        const { protocol, hostname } = new URL(url);
        return (
            protocol === 'https:' &&
            IMPORTED_AVATAR_HOSTS.some(
                (host) => hostname === host || hostname.endsWith(`.${host}`),
            )
        );
    } catch {
        return false;
    }
}

/** Скачать фото и положить в storage. Ошибка → null (и запись в лог). */
export async function importOAuthAvatar(
    userId: string,
    sourceUrl: string,
): Promise<string | null> {
    if (!isImportedAvatarUrl(sourceUrl)) return null;

    try {
        const response = await fetch(sourceUrl, {
            // Редирект мог бы увести с разрешённого хоста.
            redirect: 'error',
            signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            throw new Error(`OAUTH_AVATAR_HTTP_${response.status}`);
        }

        const mimeType = (response.headers.get('content-type') ?? '')
            .split(';')[0]
            .trim()
            .toLowerCase();
        assertAllowedImageMime(mimeType);

        const declaredSize = Number(response.headers.get('content-length'));
        if (declaredSize > MEDIA_UPLOAD_MAX_BYTES) {
            throw new Error('OAUTH_AVATAR_TOO_LARGE');
        }

        const processed = await processAvatarToWebp(
            Buffer.from(await response.arrayBuffer()),
        );
        const { publicUrl } = await getMediaStorage().put({
            key: buildAvatarStorageKey(userId, randomUUID()),
            body: processed.buffer,
            contentType: processed.mimeType,
        });

        return publicUrl;
    } catch (error) {
        // Адрес фото не логируем: в нём подпись провайдера.
        console.error(
            'OAuth avatar import failed:',
            error instanceof Error ? error.message : error,
        );
        return null;
    }
}

/**
 * Повторный вход: если в профиле всё ещё протухающая ссылка провайдера,
 * заменяем её копией свежего фото. Свой загруженный аватар, Яндекс и
 * сброшенный аватар (null) не трогаем.
 */
export async function refreshImportedAvatar(
    account: { provider: string; providerAccountId: string },
    freshImageUrl: string | null,
): Promise<void> {
    if (!isImportedAvatarUrl(freshImageUrl)) return;

    const row = await userRepository.findAuthUserByAccount(
        account.provider,
        account.providerAccountId,
    );
    if (!row || !isImportedAvatarUrl(row.image)) return;

    const imported = await importOAuthAvatar(row.id, freshImageUrl);
    if (imported) {
        await userRepository.updateImage(row.id, imported);
    }
}
