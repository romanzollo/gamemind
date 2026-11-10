/**
 * Манифест клипов AUDIO_GUESS: `audioStem` партии → хеш-имя файла.
 *
 * Зачем: игрок видит URL клипа в DevTools, поэтому файл назван хешем
 * содержимого (`/media/audio/{16 hex}.mp3`), а не по игре. Люди пишут
 * в партиях понятный `audioStem`; импорт берёт URL отсюда.
 * Пишет манифест `scripts/build-quiz-audio.ts`; приложение его не читает.
 *
 * ADR: docs/DECISIONS.md → Audio questions: AUDIO_GUESS.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST_REL = 'content/quiz-audio.manifest.json';
const MANIFEST_PATH = path.join(ROOT, MANIFEST_REL);
const AUDIO_URL_PREFIX = '/media/audio/';
const AUDIO_URL_PATTERN = /^\/media\/audio\/[0-9a-f]{16}\.mp3$/;

function readAudioManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        return { version: 1, clips: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    if (parsed.version !== 1 || typeof parsed.clips !== 'object') {
        throw new Error(`${MANIFEST_REL}: unexpected format`);
    }
    return parsed;
}

/** URL клипа по stem; неизвестный stem — ошибка, а не битый URL в БД. */
function resolveQuizAudioClip(audioStem, manifest = readAudioManifest()) {
    const clip = manifest.clips[audioStem];
    if (!clip || !AUDIO_URL_PATTERN.test(clip.url)) {
        throw new Error(
            `No built clip for audioStem "${audioStem}". Run: npm run audio:build`,
        );
    }
    return clip;
}

/** Локальный файл клипа (dev, STORAGE_PROVIDER=local-public). */
function localFileForAudioUrl(url) {
    if (!AUDIO_URL_PATTERN.test(url)) {
        throw new Error(`Not a quiz audio URL: ${url}`);
    }
    return path.join(ROOT, 'public', url.replace(/^\//, ''));
}

module.exports = {
    AUDIO_URL_PATTERN,
    AUDIO_URL_PREFIX,
    MANIFEST_PATH,
    MANIFEST_REL,
    localFileForAudioUrl,
    readAudioManifest,
    resolveQuizAudioClip,
};
