/**
 * Подпись трека AUDIO_GUESS в `Question.metadata` (track / composer /
 * performer / source): чтение для редактора и патч для записи из админки.
 * Чистые функции — без pg, их зовёт question-admin-write.repository.ts.
 * ADR: docs/DECISIONS.md → AUDIO_GUESS → Admin.
 */

import type { AdminAudioCredit } from '@/entities/question/question.types';
import type { QuestionType } from '@/types';

const AUDIO_CREDIT_KEYS = ['track', 'composer', 'performer', 'source'] as const;

/**
 * Правка подписи трека в `Question.metadata` — слиянием, не перезаписью:
 * там же лежат `metadata.audio` (нарезка из конвейера), `game`, `batch`.
 * Пустое поле удаляет ключ. Не AUDIO_GUESS — metadata не трогаем (null).
 */
export function buildAudioCreditMetadataPatch(input: {
    type: QuestionType;
    audioCredit?: AdminAudioCredit;
}): { patch: string | null; removedKeys: string[] | null } {
    if (input.type !== 'AUDIO_GUESS' || !input.audioCredit) {
        return { patch: null, removedKeys: null };
    }

    const patch: Partial<AdminAudioCredit> = {};
    const removedKeys: string[] = [];

    for (const key of AUDIO_CREDIT_KEYS) {
        const value = input.audioCredit[key].trim();
        if (value) {
            patch[key] = value;
        } else {
            removedKeys.push(key);
        }
    }

    return { patch: JSON.stringify(patch), removedKeys };
}

export type AudioCreditMetadataRow = {
    track: string | null;
    composer: string | null;
    performer: string | null;
    source: string | null;
};

export function toAdminAudioCredit(row: AudioCreditMetadataRow): AdminAudioCredit {
    return {
        track: row.track ?? '',
        composer: row.composer ?? '',
        performer: row.performer ?? '',
        source: row.source ?? '',
    };
}

export function sameAudioCredit(
    current: AdminAudioCredit,
    input: AdminAudioCredit | undefined,
): boolean {
    if (!input) {
        return true;
    }

    return AUDIO_CREDIT_KEYS.every((key) => current[key] === input[key].trim());
}
