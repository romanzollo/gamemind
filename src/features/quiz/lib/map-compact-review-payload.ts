/**
 * CompactReviewPayload → строки UI разбора.
 *
 * Неотвеченные (Blitz timer / Survival mid-wave / пропуск) не входят в список:
 * иначе фильтр «Ошибки» раскрывает correctOption — спойлер банка, а не разбор хода.
 * Счёт summary сюда не ходит. Canon: review best-effort, не complete hop.
 */

import {
    REVIEW_UNANSWERED_OPTION_ID,
    type CompactReviewPayloadV1,
} from '@/entities/quiz-result/compact-review-payload';
import type { QuizResultReviewItem } from '@/features/quiz/types';
import { pickSnapshotText } from '@/entities/quiz-session/quiz-session-snapshot';
import type { Locale } from '@/shared/i18n';

export function mapCompactReviewPayloadToItems(
    payload: CompactReviewPayloadV1,
    options: {
        locale: Locale;
    },
): QuizResultReviewItem[] {
    const items: QuizResultReviewItem[] = [];

    for (const item of payload.items) {
        const selectedIsUnanswered =
            item.selectedOptionId === REVIEW_UNANSWERED_OPTION_ID ||
            item.selectedTexts == null;

        if (selectedIsUnanswered) {
            continue;
        }

        items.push({
            questionId: item.questionId,
            position: item.position,
            text: pickSnapshotText(item.texts, undefined, options.locale),
            type: item.type,
            imageUrl: item.imageUrl ?? null,
            isCorrect: item.isCorrect,
            selectedOption: {
                id: item.selectedOptionId,
                text: pickSnapshotText(
                    item.selectedTexts ?? undefined,
                    undefined,
                    options.locale,
                ),
            },
            correctOption: {
                id: item.correctOptionId,
                text: pickSnapshotText(
                    item.correctTexts,
                    undefined,
                    options.locale,
                ),
            },
        });
    }

    return items;
}
