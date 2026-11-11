/**
 * Строка подписи трека под клипом AUDIO_GUESS в разборе.
 *
 * Подпись — часть правил цитирования (ADR AUDIO_GUESS → Rights): автор и,
 * если есть, исполнитель (кавер, вокал, лицензионная песня). Шаблоны —
 * в словаре, здесь только выбор шаблона и подстановка.
 */

import type { QuizAudioCredit } from '@/features/quiz/types';

export type TrackCreditLabels = {
    trackCredit: string;
    trackCreditWithPerformer: string;
};

export function formatTrackCredit(
    credit: QuizAudioCredit,
    labels: TrackCreditLabels,
): string {
    const template = credit.performer
        ? labels.trackCreditWithPerformer
        : labels.trackCredit;
    return template
        .replace('{track}', credit.track)
        .replace('{composer}', credit.composer)
        .replace('{performer}', credit.performer ?? '');
}
