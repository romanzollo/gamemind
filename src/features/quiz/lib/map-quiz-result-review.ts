import type { SessionReviewPayload } from '@/entities/quiz-session/quiz-session.repository';
import type { QuizResultReviewItem } from '@/features/quiz/types';

type MapQuizResultReviewOptions = {
    /** Подпись «Без ответа» для timed partial / пропусков. */
    unansweredLabel: string;
};

/**
 * Snapshot + answers → строки разбора.
 * Вопросы без ответа тоже показываем как wrong (иначе фильтр «Ошибки»
 * пустой при timed auto-submit с частичными ответами).
 */
export function mapQuizResultReview(
    payload: SessionReviewPayload | null,
    options: MapQuizResultReviewOptions,
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

        if (!answer) {
            items.push({
                questionId: question.id,
                position: question.position,
                text: question.text,
                type: question.type,
                imageUrl: question.imageUrl ?? null,
                isCorrect: false,
                selectedOption: {
                    id: '__unanswered__',
                    text: options.unansweredLabel,
                },
                correctOption: {
                    id: correctOption.id,
                    text: correctOption.text,
                },
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
