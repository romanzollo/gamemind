import { captureAppError } from '@/lib/monitoring/capture-app-error';
import {
    buildQuizAudioStorageKey,
    getMediaStorage,
    isQuizAudioPublicUrl,
    QUIZ_AUDIO_LIMITS,
    sanitizeQuizMp3,
} from '@/lib/storage';

import type { AdminPromptAssetMeta } from '@/features/admin/lib/resolve-prompt-image';

/**
 * Клип AUDIO_GUESS для admin create/edit (шаг A из ADR: готовый MP3).
 *
 * Приоритет: загруженный файл → текущий клип вопроса (скрытое поле формы).
 * Файл: sanitizeQuizMp3 (только кадры MPEG Layer III, 4–11 с, ≤ 300 КБ,
 * теги вырезаны — клип не выдаёт ответ метаданными) → имя по содержимому
 * → storage.put. Текущий URL принимаем только в формате нашего клипа
 * `/media/audio/{hash}.mp3`: подставить чужой адрес через форму нельзя.
 *
 * Только put: заменённый клип удаляет action ПОСЛЕ успешного UPDATE и только
 * если на него больше не ссылается ни один вопрос.
 * Не вызывать из quiz start — только из admin Server Actions.
 * ADR: docs/DECISIONS.md → AUDIO_GUESS → Admin.
 */

/** Лимит входного файла: чуть больше лимита клипа — теги ещё не вырезаны. */
const AUDIO_UPLOAD_MAX_INPUT_BYTES = 2 * QUIZ_AUDIO_LIMITS.maxBytes;

export type ResolveAdminPromptAudioResult =
    | {
          ok: true;
          value: { promptImageUrl: string; promptAsset?: AdminPromptAssetMeta };
      }
    | {
          ok: false;
          errorCode: 'INVALID_INPUT' | 'INVALID_AUDIO' | 'UPLOAD_FAILED';
      };

/** Непустой файл клипа из формы. Отдельно — action решает по нему про rate limit. */
export function getPromptAudioFile(formData: FormData): File | null {
    const file = formData.get('promptAudioFile');

    return typeof File !== 'undefined' && file instanceof File && file.size > 0
        ? file
        : null;
}

export async function resolveAdminPromptAudio(
    formData: FormData,
): Promise<ResolveAdminPromptAudioResult> {
    const file = getPromptAudioFile(formData);

    if (file) {
        if (file.size > AUDIO_UPLOAD_MAX_INPUT_BYTES) {
            return { ok: false, errorCode: 'INVALID_AUDIO' };
        }

        const sanitized = sanitizeQuizMp3(
            new Uint8Array(await file.arrayBuffer()),
        );
        if (!sanitized.ok) {
            return { ok: false, errorCode: 'INVALID_AUDIO' };
        }

        try {
            const body = Buffer.from(sanitized.bytes);
            const putResult = await getMediaStorage().put({
                key: buildQuizAudioStorageKey(sanitized.bytes),
                body,
                contentType: 'audio/mpeg',
                immutable: true,
            });

            return {
                ok: true,
                value: {
                    promptImageUrl: putResult.publicUrl,
                    promptAsset: {
                        storageKey: putResult.key,
                        mimeType: 'audio/mpeg',
                        width: null,
                        height: null,
                        byteSize: body.byteLength,
                    },
                },
            };
        } catch (error) {
            // Файл уже проверен — сюда доходит только сбой хранилища.
            console.error('resolveAdminPromptAudio upload failed:', error);
            captureAppError(error, {
                area: 'media-upload',
                extra: { target: 'question-audio' },
            });
            return { ok: false, errorCode: 'UPLOAD_FAILED' };
        }
    }

    const currentUrl = String(formData.get('promptAudioUrl') ?? '').trim();

    if (!currentUrl || !isQuizAudioPublicUrl(currentUrl)) {
        return { ok: false, errorCode: 'INVALID_INPUT' };
    }

    return { ok: true, value: { promptImageUrl: currentUrl } };
}
