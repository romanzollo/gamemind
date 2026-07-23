/**
 * Типы и лимиты media storage.
 *
 * MediaStorage — единственный контракт, который должны знать Server Actions
 * (admin quiz upload, avatar upload). Смена Blob → Yandex не должна
 * расползаться по features/.
 */

export type StorageProvider = 'vercel-blob' | 'yandex-s3' | 'local-public';

/** Пространства ключей в одном bucket/store: quiz-скрины и аватары. */
export const STORAGE_PREFIX = {
    quiz: 'quiz',
    avatars: 'avatars',
} as const;

export type StoragePrefix = (typeof STORAGE_PREFIX)[keyof typeof STORAGE_PREFIX];

/**
 * Публичный mount на домене приложения.
 * Браузер запрашивает `/media/...`; Next rewrite отдаёт объект из Blob/S3.
 * Seed IMAGE_GUESS по-прежнему живёт в `/quiz-images/` (git) — это другой путь.
 */
export const MEDIA_PUBLIC_MOUNT = '/media';

/**
 * Максимальный размер входного файла до sharp.
 * Лимит тела Server Action на Vercel ~4.5 MB — оставляем запас.
 */
export const MEDIA_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

/** Разрешённые MIME на входе. SVG запрещён (XSS в <img> / разметке). */
export const MEDIA_ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
] as const;

export type MediaAllowedMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];

export type PutObjectInput = {
    /** Ключ в store, напр. `quiz/{id}-{uuid}.webp`. */
    key: string;
    body: Buffer;
    /** После sharp обычно всегда image/webp. */
    contentType: 'image/webp' | MediaAllowedMimeType;
};

export type PutObjectResult = {
    key: string;
    /**
     * Значение для QuestionAsset.url / User.image / snapshot imageUrl.
     * Обычно относительный `/media/...` (same-origin, RU-first).
     */
    publicUrl: string;
};

export type DeleteObjectInput = {
    key: string;
};

/**
 * Сменный бэкенд. Не импортировать Prisma и не вызывать из startQuizAction.
 */
export type MediaStorage = {
    readonly provider: StorageProvider;
    put(input: PutObjectInput): Promise<PutObjectResult>;
    /** Best-effort: ошибку delete на clear/replace можно глотать на уровне action. */
    delete(input: DeleteObjectInput): Promise<void>;
    /** Синхронно: key → URL для клиента. Без сети. */
    publicUrl(key: string): string;
};
