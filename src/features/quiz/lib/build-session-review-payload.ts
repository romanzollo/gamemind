/**
 * Snapshot JSON + answers → SessionReviewPayload без второго DB round-trip.
 *
 * Зачем: result page раньше делал score query, потом отдельный findReviewForUser —
 * на Windows+Neon второй TLS после submit часто ловил DirectPgTimeout.
 * Canon: mapQuizResultReview; texts из frozen snapshot (v2 bilingual).
 */

import type { SessionReviewPayload } from '@/entities/quiz-session/quiz-session.types';
import type { QuizSessionSnapshotData } from '@/entities/quiz-session/quiz-session-snapshot';
import {
    pickSnapshotText,
} from '@/entities/quiz-session/quiz-session-snapshot';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';
import type { Locale } from '@/shared/i18n';

type BuildSessionReviewPayloadInput = {
    sessionId: string;
    questionCount: number;
    snapshotData: QuizSessionSnapshotData;
    answers: SessionReviewPayload['answers'];
    locale: Locale;
};

export function buildSessionReviewPayloadFromSnapshot(
    input: BuildSessionReviewPayloadInput,
): SessionReviewPayload {
    const questions = [...input.snapshotData.questions]
        .sort((left, right) => left.position - right.position)
        .map((question) => ({
            id: question.id,
            text: pickSnapshotText(question.texts, question.text, input.locale),
            difficulty: question.difficulty,
            type: question.type,
            imageUrl: normalizeQuizImageUrl(question.imageUrl),
            position: question.position,
            options: [...question.options]
                .sort((left, right) => left.order - right.order)
                .map((option) => ({
                    id: option.id,
                    text: pickSnapshotText(
                        option.texts,
                        option.text,
                        input.locale,
                    ),
                    order: option.order,
                    isCorrect: option.isCorrect,
                })),
        }));

    return {
        sessionId: input.sessionId,
        questionCount: input.questionCount,
        questions,
        answers: input.answers,
    };
}
