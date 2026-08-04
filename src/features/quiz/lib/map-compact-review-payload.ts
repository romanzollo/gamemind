/**
 * CompactReviewPayload → строки UI разбора (locale + unanswered label).
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
        unansweredLabel: string;
    },
): QuizResultReviewItem[] {
    return payload.items.map((item) => {
        const selectedIsUnanswered =
            item.selectedOptionId === REVIEW_UNANSWERED_OPTION_ID ||
            item.selectedTexts == null;

        return {
            questionId: item.questionId,
            position: item.position,
            text: pickSnapshotText(item.texts, undefined, options.locale),
            type: item.type,
            imageUrl: item.imageUrl ?? null,
            isCorrect: item.isCorrect,
            selectedOption: {
                id: item.selectedOptionId,
                text: selectedIsUnanswered
                    ? options.unansweredLabel
                    : pickSnapshotText(
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
        };
    });
}
