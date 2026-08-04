/**
 * Snapshot (уже в памяти на submit) + answers → slim reviewPayload.
 *
 * Не читать TOAST повторно. texts ru/en из frozen snapshot (v2) или legacy text.
 */

import type { QuizSessionSnapshotData } from '@/entities/quiz-session/quiz-session-snapshot';
import { pickSnapshotText } from '@/entities/quiz-session/quiz-session-snapshot';
import type { LocalizedSnapshotTexts } from '@/entities/question/question.types';
import {
    COMPACT_REVIEW_PAYLOAD_VERSION,
    REVIEW_UNANSWERED_OPTION_ID,
    type CompactReviewPayloadItem,
    type CompactReviewPayloadV1,
} from '@/entities/quiz-result/compact-review-payload';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

type AnswerRow = {
    questionId: string;
    selectedOptionId: string;
};

function textsFromSnapshot(
    texts: LocalizedSnapshotTexts | undefined,
    legacyText: string | undefined,
): LocalizedSnapshotTexts {
    const ru = pickSnapshotText(texts, legacyText, 'ru');
    const en = pickSnapshotText(texts, legacyText, 'en');

    return { ru, en };
}

export function buildCompactReviewPayload(input: {
    snapshotData: QuizSessionSnapshotData;
    answers: AnswerRow[];
}): CompactReviewPayloadV1 {
    const answersByQuestionId = new Map(
        input.answers.map((answer) => [answer.questionId, answer]),
    );

    const items: CompactReviewPayloadItem[] = [];

    const questions = [...input.snapshotData.questions].sort(
        (left, right) => left.position - right.position,
    );

    for (const question of questions) {
        const correctOption = question.options.find(
            (option) => option.isCorrect,
        );

        if (!correctOption) {
            continue;
        }

        const answer = answersByQuestionId.get(question.id);
        const questionTexts = textsFromSnapshot(question.texts, question.text);
        const correctTexts = textsFromSnapshot(
            correctOption.texts,
            correctOption.text,
        );

        if (!answer) {
            items.push({
                questionId: question.id,
                position: question.position,
                type: question.type,
                imageUrl: normalizeQuizImageUrl(question.imageUrl),
                texts: questionTexts,
                isCorrect: false,
                selectedOptionId: REVIEW_UNANSWERED_OPTION_ID,
                selectedTexts: null,
                correctOptionId: correctOption.id,
                correctTexts,
            });
            continue;
        }

        const selectedOption = question.options.find(
            (option) => option.id === answer.selectedOptionId,
        );

        if (!selectedOption) {
            continue;
        }

        items.push({
            questionId: question.id,
            position: question.position,
            type: question.type,
            imageUrl: normalizeQuizImageUrl(question.imageUrl),
            texts: questionTexts,
            isCorrect: selectedOption.isCorrect,
            selectedOptionId: selectedOption.id,
            selectedTexts: textsFromSnapshot(
                selectedOption.texts,
                selectedOption.text,
            ),
            correctOptionId: correctOption.id,
            correctTexts,
        });
    }

    return {
        version: COMPACT_REVIEW_PAYLOAD_VERSION,
        items,
    };
}
