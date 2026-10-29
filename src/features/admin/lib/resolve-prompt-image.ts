import { randomUUID } from 'node:crypto';

import { captureAppError } from '@/lib/monitoring/capture-app-error';
import {
    assertAllowedImageMime,
    assertImageWithinUploadLimit,
    buildQuizStorageKey,
    getMediaStorage,
    processQuizImageToWebp,
} from '@/lib/storage';

/**
 * Разрешение prompt-картинки для IMAGE_GUESS в admin create/edit.
 *
 * Приоритет: загруженный файл → URL-поле (legacy /quiz-images или ручной путь).
 * File: MIME/size → sharp (полный кадр) → storage.put → same-origin `/media/quiz/...`.
 * Только put: старый объект удаляет action ПОСЛЕ успешного UPDATE
 * (deleteReplacedMediaObject), иначе упавшая запись оставила бы вопрос
 * со ссылкой на удалённую картинку.
 * Не вызывать из quiz start — только из admin Server Actions.
 */

export type AdminPromptAssetMeta = {
    storageKey: string;
    mimeType: 'image/webp';
    width: number;
    height: number;
    byteSize: number;
};

export type ResolvedAdminPromptImage = {
    promptImageUrl: string;
    promptAsset?: AdminPromptAssetMeta;
};

export type ResolveAdminPromptImageResult =
    | { ok: true; value: ResolvedAdminPromptImage }
    | {
          ok: false;
          errorCode: 'INVALID_INPUT' | 'INVALID_IMAGE' | 'UPLOAD_FAILED';
      };

export async function resolveAdminPromptImage(options: {
    formData: FormData;
    type: 'TEXT' | 'IMAGE_GUESS';
    /** Для ключа объекта и привязки к вопросу (create — сгенерированный id). */
    questionIdForKey: string;
}): Promise<ResolveAdminPromptImageResult> {
    if (options.type !== 'IMAGE_GUESS') {
        return { ok: true, value: { promptImageUrl: '' } };
    }

    const file = getPromptImageFile(options.formData, options.type);

    if (file) {
        try {
            assertAllowedImageMime(file.type || 'application/octet-stream');
            assertImageWithinUploadLimit(file.size);

            const inputBuffer = Buffer.from(await file.arrayBuffer());
            const processed = await processQuizImageToWebp(inputBuffer);
            const key = buildQuizStorageKey(
                options.questionIdForKey,
                randomUUID(),
            );
            const storage = getMediaStorage();
            const putResult = await storage.put({
                key,
                body: processed.buffer,
                contentType: processed.mimeType,
            });

            return {
                ok: true,
                value: {
                    promptImageUrl: putResult.publicUrl,
                    promptAsset: {
                        storageKey: putResult.key,
                        mimeType: processed.mimeType,
                        width: processed.width,
                        height: processed.height,
                        byteSize: processed.byteSize,
                    },
                },
            };
        } catch (error) {
            // Всегда в Runtime Logs: на prod иначе UPLOAD_FAILED без причины
            console.error('resolveAdminPromptImage upload failed:', error);

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

            // Невалидный файл — ошибка ввода; сюда доходит наш сбой (sharp, Blob).
            captureAppError(error, {
                area: 'media-upload',
                extra: { target: 'question-prompt' },
            });
            return { ok: false, errorCode: 'UPLOAD_FAILED' };
        }
    }

    const promptImageUrl = String(
        options.formData.get('promptImageUrl') ?? '',
    ).trim();

    if (!promptImageUrl) {
        return { ok: false, errorCode: 'INVALID_INPUT' };
    }

    return {
        ok: true,
        value: { promptImageUrl },
    };
}

/**
 * Непустой файл prompt-картинки из формы (только для IMAGE_GUESS).
 * Отдельно от resolve: action по нему решает, тратить ли `upload` rate limit.
 */
export function getPromptImageFile(
    formData: FormData,
    type: 'TEXT' | 'IMAGE_GUESS',
): File | null {
    if (type !== 'IMAGE_GUESS') {
        return null;
    }

    const file = formData.get('promptImageFile');

    return typeof File !== 'undefined' && file instanceof File && file.size > 0
        ? file
        : null;
}
