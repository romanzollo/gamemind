/**
 * Media storage — загрузка и раздача картинок квиза и аватаров.
 *
 * Архитектура (см. docs/DECISIONS.md → Media Storage And Upload RU-first):
 * - в Neon только URL (+ optional storageKey), никогда bytes;
 * - quiz snapshot на старте замораживает URL и больше не ходит в storage;
 * - браузер в РФ предпочтительно ходит на same-origin `/media/...`, не на CF CDN;
 * - провайдер сменный через STORAGE_PROVIDER (vercel-blob | yandex-s3 | local-public).
 *
 * Точка входа для Server Actions: getMediaStorage().put / .delete / .publicUrl
 * и processQuizImageToWebp / processAvatarToWebp перед put.
 */

export {
    MEDIA_ALLOWED_MIME_TYPES,
    MEDIA_PUBLIC_MOUNT,
    MEDIA_UPLOAD_MAX_BYTES,
    STORAGE_PREFIX,
    type DeleteObjectInput,
    type MediaAllowedMimeType,
    type MediaStorage,
    type PutObjectInput,
    type PutObjectResult,
    type StoragePrefix,
    type StorageProvider,
} from '@/lib/storage/types';

export {
    buildAvatarStorageKey,
    buildQuizStorageKey,
    buildStorageKey,
    normalizeStorageKey,
    publicUrlFromKey,
    storageKeyFromPublicUrl,
} from '@/lib/storage/paths';

export { getMediaStorage } from '@/lib/storage/get-media-storage';

export {
    AVATAR_SIZE_PX,
    AVATAR_WEBP_QUALITY,
    QUIZ_IMAGE_MAX_HEIGHT,
    QUIZ_IMAGE_MAX_WIDTH,
    QUIZ_IMAGE_WEBP_QUALITY,
    assertAllowedImageMime,
    assertImageWithinUploadLimit,
    processAvatarToWebp,
    processQuizImageToWebp,
    type ProcessedImage,
} from '@/lib/storage/image-process';
