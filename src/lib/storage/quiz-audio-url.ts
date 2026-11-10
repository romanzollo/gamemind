/**
 * Формат публичного пути клипа AUDIO_GUESS: `/media/audio/{16hex}.mp3`.
 * Чистый модуль без node:crypto — его можно звать из Zod-схем админки.
 * Имя по содержимому строит quiz-audio.ts (только сервер).
 */

const QUIZ_AUDIO_PUBLIC_URL_PATTERN = /^\/media\/audio\/[0-9a-f]{16}\.mp3$/;

/**
 * Это наш клип? Форма редактора присылает текущий URL клипа обратно —
 * чужой путь или внешний адрес не принимаем.
 */
export function isQuizAudioPublicUrl(url: string): boolean {
    return QUIZ_AUDIO_PUBLIC_URL_PATTERN.test(url.trim());
}
