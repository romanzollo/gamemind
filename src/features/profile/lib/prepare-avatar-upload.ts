/**
 * Подготовка фото для аватара в браузере, до отправки формы.
 *
 * Зачем: фото с телефона весит 3–10 МБ, а запрос Server Action ограничен
 * 3 МБ (`bodySizeLimit`, next.config), Vercel — 4,5 МБ. Такой запрос
 * отбрасывается до нашего кода, и игрок не видит ошибки. Поэтому большое
 * фото уменьшаем здесь до 1024 px и пересжимаем в JPEG; сервер, как и
 * раньше, проверяет тип и размер и режет квадрат (resolve-avatar-image).
 *
 * Только клиент: canvas и createImageBitmap.
 */

import { MEDIA_UPLOAD_MAX_BYTES } from '@/lib/storage/types';

/** Длинная сторона после уменьшения: с запасом для аватара 256 px на ретине. */
export const AVATAR_PREPARE_MAX_SIDE = 1024;
/** До этого размера файл уходит как есть (PNG сохранит прозрачность). */
export const AVATAR_SEND_AS_IS_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.88;

/** Размер после уменьшения: длинная сторона ≤ max, пропорции сохраняются. */
export function fitWithin(
    width: number,
    height: number,
    maxSide: number = AVATAR_PREPARE_MAX_SIDE,
): { width: number; height: number } {
    const longest = Math.max(width, height);
    if (longest <= maxSide) return { width, height };
    const scale = maxSide / longest;
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

export type PrepareAvatarResult =
    | { ok: true; file: File }
    | { ok: false; reason: 'unreadable' | 'too_large' };

export async function prepareAvatarUpload(file: File): Promise<PrepareAvatarResult> {
    if (file.size <= AVATAR_SEND_AS_IS_BYTES) {
        return { ok: true, file };
    }

    let bitmap: ImageBitmap;
    try {
        // from-image: учитывает поворот из EXIF (фото с телефона «на боку»).
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
        return { ok: false, reason: 'unreadable' };
    }

    try {
        const size = fitWithin(bitmap.width, bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext('2d');
        if (!context) return { ok: false, reason: 'unreadable' };
        context.drawImage(bitmap, 0, 0, size.width, size.height);

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
        );
        if (!blob) return { ok: false, reason: 'unreadable' };
        if (blob.size > MEDIA_UPLOAD_MAX_BYTES) return { ok: false, reason: 'too_large' };

        const name = `${file.name.replace(/\.[^.]+$/, '') || 'avatar'}.jpg`;
        return { ok: true, file: new File([blob], name, { type: 'image/jpeg' }) };
    } finally {
        bitmap.close();
    }
}
