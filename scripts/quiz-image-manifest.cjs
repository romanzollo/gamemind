/**
 * Манифест картинок IMAGE_GUESS: логическое имя → непрозрачное имя файла.
 *
 * Зачем: имя файла уходит в браузер во время игры. `/quiz-images/medium/
 * baldurs-gate-3.webp` выдаёт ответ в DevTools, поэтому в public/ и в БД
 * живут только имена-хеши содержимого (`/quiz-images/medium/<16 hex>.webp`).
 * Авторы контента по-прежнему пишут логический путь со slug (партии,
 * seed, content/fixes) — скрипты переводят его через этот манифест.
 *
 * Инварианты:
 * - имя = первые 16 hex SHA-256 байтов WebP: та же картинка → то же имя,
 *   новая версия → новое имя (кеш CDN не отдаст старую под тем же URL);
 * - папка сложности остаётся в пути: по `/quiz-images/easy/` UI включает
 *   pixel-art рендер, а сложность игрок и так видит;
 * - манифест — только для скриптов (Node), в бандл приложения не попадает.
 *
 * ADR: docs/DECISIONS.md → Quiz answer leak — opaque play ids.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'content', 'quiz-images.manifest.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const IMAGE_DIR = path.join(PUBLIC_DIR, 'quiz-images');

const DIFFICULTY_FOLDERS = ['easy', 'medium', 'hard'];
const HASH_LENGTH = 16;

const LOGICAL_URL_RE = /^\/quiz-images\/(easy|medium|hard)\/([a-z0-9][a-z0-9-]*)\.(webp|svg)$/;
const HASHED_URL_RE = new RegExp(
    `^/quiz-images/(easy|medium|hard)/[0-9a-f]{${HASH_LENGTH}}\\.webp$`,
);
/** Любой путь картинки внутри JSON (снапшот, разбор): ищем и заменяем по нему. */
const ANY_QUIZ_IMAGE_URL_RE =
    /\/quiz-images\/(?:easy|medium|hard)\/[a-z0-9][a-z0-9-]*\.(?:webp|svg)/g;

function hashImageBytes(buffer) {
    return crypto
        .createHash('sha256')
        .update(buffer)
        .digest('hex')
        .slice(0, HASH_LENGTH);
}

function hashedUrlFor(folder, buffer) {
    return `/quiz-images/${folder}/${hashImageBytes(buffer)}.webp`;
}

function isHashedQuizImageUrl(url) {
    return HASHED_URL_RE.test(url);
}

/** `.svg`-заглушки старых снапшотов указывают на тот же slug, что и `.webp`. */
function logicalWebpUrl(url) {
    const match = LOGICAL_URL_RE.exec(url);
    if (!match) return null;
    return `/quiz-images/${match[1]}/${match[2]}.webp`;
}

function filePathForUrl(url) {
    return path.join(PUBLIC_DIR, url.replace(/^\//, ''));
}

function readManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        return { images: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    if (!parsed || typeof parsed.images !== 'object') {
        throw new Error(`Invalid manifest: ${MANIFEST_PATH}`);
    }
    return parsed;
}

/** Ключи сортируем: дифф манифеста в git читается построчно. */
function writeManifest(manifest) {
    const images = {};
    for (const key of Object.keys(manifest.images).sort()) {
        images[key] = manifest.images[key];
    }
    const body = {
        description:
            'Logical IMAGE_GUESS path (authoring, slug) → opaque content-hash path served to players. Scripts only; see docs/QUIZ_IMAGES.md.',
        images,
    };
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(body, null, 4)}\n`);
}

/**
 * Логический путь → путь, который пишем в БД.
 * Уже хешированный путь возвращается как есть; неизвестный slug — ошибка
 * (иначе в БД попала бы ссылка на несуществующий файл или старое имя).
 */
function resolveQuizImageUrl(url, manifest = readManifest()) {
    const trimmed = typeof url === 'string' ? url.trim() : '';
    if (isHashedQuizImageUrl(trimmed)) {
        return trimmed;
    }
    const logical = logicalWebpUrl(trimmed);
    const resolved = logical ? manifest.images[logical] : undefined;
    if (!resolved) {
        throw new Error(
            `Quiz image ${trimmed || '(empty)'} is not in content/quiz-images.manifest.json. Run npm run images:optimize first.`,
        );
    }
    return resolved;
}

module.exports = {
    ANY_QUIZ_IMAGE_URL_RE,
    DIFFICULTY_FOLDERS,
    IMAGE_DIR,
    MANIFEST_PATH,
    filePathForUrl,
    hashImageBytes,
    hashedUrlFor,
    isHashedQuizImageUrl,
    logicalWebpUrl,
    readManifest,
    resolveQuizImageUrl,
    writeManifest,
};
