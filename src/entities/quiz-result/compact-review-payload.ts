/**
 * Контракт slim bilingual review на QuizResult.reviewPayload (option B).
 *
 * Живёт в entities: репозиторий result читает/пишет JSON без зависимости от features.
 * Сборка на submit и map→UI — в features/quiz/lib.
 * Canon: DECISIONS → Quiz Start / Session Load Playbook (reviewPayload).
 */

import type { LocalizedSnapshotTexts } from '@/entities/question/question.types';
import type { QuestionType } from '@/types';

export const COMPACT_REVIEW_PAYLOAD_VERSION = 1 as const;

/** Маркер «без ответа» (timed partial). Mapper разбора такие items пропускает. */
export const REVIEW_UNANSWERED_OPTION_ID = '__unanswered__';

export type CompactReviewPayloadItem = {
    questionId: string;
    position: number;
    type?: QuestionType;
    imageUrl?: string | null;
    texts: LocalizedSnapshotTexts;
    isCorrect: boolean;
    selectedOptionId: string;
    /** null, если selectedOptionId === REVIEW_UNANSWERED_OPTION_ID */
    selectedTexts: LocalizedSnapshotTexts | null;
    correctOptionId: string;
    correctTexts: LocalizedSnapshotTexts;
};

export type CompactReviewPayloadV1 = {
    version: typeof COMPACT_REVIEW_PAYLOAD_VERSION;
    items: CompactReviewPayloadItem[];
};

export function parseCompactReviewPayload(
    value: unknown,
): CompactReviewPayloadV1 | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const record = value as {
        version?: unknown;
        items?: unknown;
    };

    if (record.version !== COMPACT_REVIEW_PAYLOAD_VERSION) {
        return null;
    }

    if (!Array.isArray(record.items) || record.items.length === 0) {
        return null;
    }

    return value as CompactReviewPayloadV1;
}
