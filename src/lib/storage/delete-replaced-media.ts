import { getMediaStorage } from '@/lib/storage/get-media-storage';
import {
    isStorageKeyOwnedBy,
    storageKeyFromPublicUrl,
} from '@/lib/storage/paths';
import type { StoragePrefix } from '@/lib/storage/types';

/**
 * Best-effort удаление объекта, который больше не используется после замены.
 *
 * Вызывать ТОЛЬКО после успешной записи нового URL в БД: если UPDATE упал,
 * старая картинка должна остаться живой (строка в БД всё ещё на неё ссылается).
 * Новый загруженный объект при упавшем UPDATE становится сиротой — это
 * безопасная сторона (orphan cleanup отдельно), битая ссылка — нет.
 *
 * Удаляем только `/media/...` ключи владельца (isStorageKeyOwnedBy):
 * seed `/quiz-images/...` и чужие загрузки не трогаем.
 * Ошибку delete глотаем — сохранение уже прошло.
 *
 * Trade-off: quiz snapshot замораживает imageUrl на старте, поэтому review
 * старых сессий после замены картинки покажет битое изображение.
 */
export async function deleteReplacedMediaObject(options: {
    previousPublicUrl: string | null | undefined;
    nextPublicUrl: string | null | undefined;
    owner: { prefix: StoragePrefix; idPart: string };
}): Promise<void> {
    const previousUrl = options.previousPublicUrl?.trim();
    if (!previousUrl) {
        return;
    }

    const previousKey = storageKeyFromPublicUrl(previousUrl);
    if (!previousKey || !isStorageKeyOwnedBy(previousKey, options.owner)) {
        return;
    }

    // Абсолютный и относительный URL одного объекта — тот же ключ: не удаляем.
    const nextUrl = options.nextPublicUrl?.trim();
    const nextKey = nextUrl ? storageKeyFromPublicUrl(nextUrl) : null;
    if (nextKey === previousKey) {
        return;
    }

    try {
        await getMediaStorage().delete({ key: previousKey });
    } catch (error) {
        console.warn(
            '[storage] delete replaced object failed:',
            previousKey,
            error instanceof Error ? error.message : error,
        );
    }
}
