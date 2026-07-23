import { randomUUID } from 'node:crypto';

import {
    assertAllowedImageMime,
    assertImageWithinUploadLimit,
    buildAvatarStorageKey,
    getMediaStorage,
    processAvatarToWebp,
    storageKeyFromPublicUrl,
} from '@/lib/storage';

/**
 * Разрешение аватара для profile Phase B.
 *
 * Приоритет: загруженный файл → URL-поле (advanced) → пустая строка (clear).
 * File: MIME/size → sharp square cover → storage.put → `/media/avatars/...`.
 * Старый `/media/...` удаляется best-effort при replace/clear.
 */

export type ResolveAvatarImageResult =
    | { ok: true; imageUrl: string }
    | {
          ok: false;
          errorCode: 'INVALID_INPUT' | 'INVALID_IMAGE' | 'UPLOAD_FAILED';
      };

export async function resolveAvatarImage(options: {
    formData: FormData;
    userId: string;
    previousPublicUrl: string | null;
}): Promise<ResolveAvatarImageResult> {
    const file = options.formData.get('avatarFile');
    const hasFile =
        typeof File !== 'undefined' &&
        file instanceof File &&
        file.size > 0;

    if (hasFile) {
        try {
            assertAllowedImageMime(file.type || 'application/octet-stream');
            assertImageWithinUploadLimit(file.size);

            const inputBuffer = Buffer.from(await file.arrayBuffer());
            const processed = await processAvatarToWebp(inputBuffer);
            const key = buildAvatarStorageKey(options.userId, randomUUID());
            const storage = getMediaStorage();
            const putResult = await storage.put({
                key,
                body: processed.buffer,
                contentType: processed.mimeType,
            });

            await deletePreviousMediaObject(options.previousPublicUrl);

            return { ok: true, imageUrl: putResult.publicUrl };
        } catch (error) {
            // Всегда в Runtime Logs: на prod иначе UPLOAD_FAILED без причины
            console.error('resolveAvatarImage upload failed:', error);

            const message =
                error instanceof Error ? error.message.toLowerCase() : '';
            if (
                message.includes('mime') ||
                message.includes('max size') ||
                message.includes('empty') ||
                message.includes('unsupported')
            ) {
                return { ok: false, errorCode: 'INVALID_IMAGE' };
            }

            return { ok: false, errorCode: 'UPLOAD_FAILED' };
        }
    }

    const clearRequested = options.formData.get('clearAvatar') === '1';
    if (clearRequested) {
        await deletePreviousMediaObject(options.previousPublicUrl);
        return { ok: true, imageUrl: '' };
    }

    const imageUrlRaw = options.formData.get('imageUrl');
    const imageUrl =
        typeof imageUrlRaw === 'string' ? imageUrlRaw.trim() : '';

    // Save без файла и без URL — ошибка, не silent clear
    if (imageUrl === '') {
        return { ok: false, errorCode: 'INVALID_INPUT' };
    }

    if (
        !(
            imageUrl.startsWith('/') ||
            imageUrl.startsWith('https://')
        ) ||
        /^javascript:/i.test(imageUrl) ||
        /^data:/i.test(imageUrl) ||
        /\.svg(\?|#|$)/i.test(imageUrl) ||
        imageUrl.length > 2048
    ) {
        return { ok: false, errorCode: 'INVALID_INPUT' };
    }

    return { ok: true, imageUrl };
}

async function deletePreviousMediaObject(
    previousPublicUrl: string | null,
): Promise<void> {
    const key = previousPublicUrl
        ? storageKeyFromPublicUrl(previousPublicUrl)
        : null;
    if (!key) {
        return;
    }

    try {
        await getMediaStorage().delete({ key });
    } catch {
        // orphan cleanup later
    }
}
