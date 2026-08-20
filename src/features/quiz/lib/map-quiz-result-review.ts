import { REVIEW_UNANSWERED_OPTION_ID } from '@/entities/quiz-result/compact-review-payload';
import type { SessionReviewPayload } from '@/entities/quiz-session/quiz-session.repository';
import type { QuizResultReviewItem } from '@/features/quiz/types';

/**
 * Snapshot + answers → строки разбора.
 *
 * Только вопросы с реальным выбором. Неотвеченные не показываем и не
 * раскрываем correctOption (Blitz / Survival partial ≠ «ошибка в банке»).
 * Счёт summary не строится отсюда.
 */
export function mapQuizResultReview(
    payload: SessionReviewPayload | null,
): QuizResultReviewItem[] {
    if (!payload) {
        return [];
    }

    const answersByQuestionId = new Map(
        payload.answers.map((answer) => [answer.questionId, answer]),
    );

    const items: QuizResultReviewItem[] = [];

    for (const question of payload.questions) {
        const answer = answersByQuestionId.get(question.id);
        const correctOption = question.options.find(
            (option) => option.isCorrect,
        );

        if (!correctOption) {
            continue;
        }

        if (
            !answer ||
            answer.selectedOptionId === REVIEW_UNANSWERED_OPTION_ID
        ) {
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
            text: question.text,
            type: question.type,
            imageUrl: question.imageUrl ?? null,
            // Prefer snapshot correctness over stored QuizAnswer.isCorrect
            isCorrect: selectedOption.isCorrect,
            selectedOption: {
                id: selectedOption.id,
                text: selectedOption.text,
            },
            correctOption: {
                id: correctOption.id,
                text: correctOption.text,
            },
        });
    }

    return items;
}
