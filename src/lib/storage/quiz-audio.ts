/**
 * Имена клипов AUDIO_GUESS в хранилище.
 *
 * Клип называется по содержимому: первые 16 hex SHA-256 очищенных байтов →
 * ключ `audio/{hash}.mp3`, публичный путь `/media/audio/{hash}.mp3`. Так же
 * называет файлы конвейер (`scripts/build-quiz-audio.ts`), поэтому клип из
 * админки и клип из партии неотличимы, а повторная загрузка того же файла
 * не плодит копии. Следствие: один файл может быть у двух вопросов —
 * удалять его можно, только когда на него больше никто не ссылается.
 *
 * Только сервер (node:crypto). ADR: docs/DECISIONS.md → AUDIO_GUESS.
 */

import { createHash } from 'node:crypto';

import { STORAGE_PREFIX } from '@/lib/storage/types';

/** Ключ клипа по его байтам (после sanitizeQuizMp3). */
export function buildQuizAudioStorageKey(bytes: Uint8Array): string {
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);

    return `${STORAGE_PREFIX.audio}/${hash}.mp3`;
}

export { isQuizAudioPublicUrl } from '@/lib/storage/quiz-audio-url';
