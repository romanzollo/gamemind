import type { SessionReviewPayload } from '@/entities/quiz-session/quiz-session.repository';
import type { QuizResultReviewItem } from '@/features/quiz/types';

// функция для преобразования результатов обзора сессии в тип QuizResultReviewItem
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

        if (!answer) {
            continue;
        }

        const selectedOption = question.options.find(
            (option) => option.id === answer.selectedOptionId,
        );
        const correctOption = question.options.find(
            (option) => option.isCorrect,
        );

        if (!selectedOption || !correctOption) {
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
