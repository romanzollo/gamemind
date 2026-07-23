import sharp from 'sharp';

import {
    MEDIA_ALLOWED_MIME_TYPES,
    MEDIA_UPLOAD_MAX_BYTES,
    type MediaAllowedMimeType,
} from '@/lib/storage/types';

/**
 * Обработка картинок на upload-time (admin quiz + avatar).
 *
 * Правила (ADR + docs/QUIZ_IMAGES.md):
 * - quiz IMAGE_GUESS: полный кадр (`inside`, без crop) → WebP; UI = object-contain;
 * - avatar: квадратный cover crop по центру → WebP; UI = object-cover в круге;
 * - никогда не вызывать из startQuizAction / scoring — только в Server Action upload.
 *
 * Логика близка к scripts/optimize-quiz-images.cjs (trim + pixel-art nearest),
 * чтобы seed и admin upload давали похожий результат.
 */

/** Макс. рамка для quiz-скрина (как в QUIZ_IMAGES.md). */
export const QUIZ_IMAGE_MAX_WIDTH = 1280;
export const QUIZ_IMAGE_MAX_HEIGHT = 720;
export const QUIZ_IMAGE_WEBP_QUALITY = 80;

/** Сторона квадрата аватара после crop. */
export const AVATAR_SIZE_PX = 512;
export const AVATAR_WEBP_QUALITY = 82;

export type ProcessedImage = {
    buffer: Buffer;
    width: number;
    height: number;
    byteSize: number;
    mimeType: 'image/webp';
};

/**
 * Проверка MIME до sharp. SVG / чужие типы — отказ (XSS и мусор в store).
 */
export function assertAllowedImageMime(
    mimeType: string,
): asserts mimeType is MediaAllowedMimeType {
    if (!(MEDIA_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
        throw new Error(
            `Unsupported image MIME type: ${mimeType}. Allowed: ${MEDIA_ALLOWED_MIME_TYPES.join(', ')}`,
        );
    }
}

/** Проверка размера входного файла (до sharp). */
export function assertImageWithinUploadLimit(byteLength: number): void {
    if (byteLength <= 0) {
        throw new Error('Image file is empty');
    }
    if (byteLength > MEDIA_UPLOAD_MAX_BYTES) {
        throw new Error(
            `Image exceeds max size of ${MEDIA_UPLOAD_MAX_BYTES} bytes`,
        );
    }
}

/**
 * Quiz prompt: trim letterbox → pixel-art nearest upscale ИЛИ fit inside 1280×720
 * → WebP. Соотношение сторон сохраняем (без cover-crop).
 */
export async function processQuizImageToWebp(
    input: Buffer,
): Promise<ProcessedImage> {
    assertImageWithinUploadLimit(input.byteLength);

    let pipeline = sharp(input).rotate();
    const before = await pipeline.metadata();

    // Убрать чёрные поля, часто прилипающие к ретро-скриншотам
    try {
        const trimmed = await pipeline
            .clone()
            .trim({ threshold: 18 })
            .toBuffer({ resolveWithObject: true });
        if (trimmed.info.width >= 32 && trimmed.info.height >= 32) {
            pipeline = sharp(trimmed.data);
        }
    } catch {
        pipeline = sharp(input).rotate();
    }

    const meta = await pipeline.metadata();
    const width = meta.width ?? before.width ?? 0;
    const height = meta.height ?? before.height ?? 0;
    const isPixelArt = width > 0 && height > 0 && width <= 360 && height <= 360;

    if (isPixelArt) {
        // NES/GB: один nearest-upscale (как optimize-скрипт), без второго fit
        const minDisplayWidth = 960;
        const scale = Math.min(
            QUIZ_IMAGE_MAX_WIDTH / width,
            QUIZ_IMAGE_MAX_HEIGHT / height,
            Math.max(minDisplayWidth / width, 1),
            6,
        );
        pipeline = pipeline.resize(
            Math.max(1, Math.round(width * scale)),
            Math.max(1, Math.round(height * scale)),
            { kernel: sharp.kernel.nearest },
        );
    } else {
        pipeline = pipeline.resize({
            width: QUIZ_IMAGE_MAX_WIDTH,
            height: QUIZ_IMAGE_MAX_HEIGHT,
            fit: 'inside',
            withoutEnlargement: false,
        });
    }

    const { data, info } = await pipeline
        .webp({ quality: QUIZ_IMAGE_WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });

    return {
        buffer: copyToOwnedBuffer(data),
        width: info.width,
        height: info.height,
        byteSize: data.byteLength,
        mimeType: 'image/webp',
    };
}

/**
 * Avatar: квадрат cover по центру → WebP.
 * В круге UI использовать object-cover, не object-contain.
 */
export async function processAvatarToWebp(
    input: Buffer,
): Promise<ProcessedImage> {
    assertImageWithinUploadLimit(input.byteLength);

    const { data, info } = await sharp(input)
        .rotate()
        .resize({
            width: AVATAR_SIZE_PX,
            height: AVATAR_SIZE_PX,
            fit: 'cover',
            position: 'centre',
        })
        .webp({ quality: AVATAR_WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });

    return {
        // Owned copy: sharp Buffer на Vercel может сидеть на SharedArrayBuffer
        buffer: copyToOwnedBuffer(data),
        width: info.width,
        height: info.height,
        byteSize: data.byteLength,
        mimeType: 'image/webp',
    };
}

/**
 * Свежий Buffer.alloc — гарантированно не SharedArrayBuffer.
 * Нужен перед Vercel Blob put/fetch (undici: SharedArrayBuffer is not allowed).
 */
function copyToOwnedBuffer(source: Buffer): Buffer {
    const owned = Buffer.alloc(source.byteLength);
    owned.set(source);
    return owned;
}
