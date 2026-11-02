/**
 * Данные игры → вид для браузера. Единственное место, где из данных игры
 * уходят id из БД и правильность ответа.
 *
 * Только сервер (node:crypto через ключ ответа и токены).
 * Canon: docs/DECISIONS.md → Answer lock-in; Quiz answer leak.
 */

import { sealQuizAnswerKey } from '@/entities/quiz-session/quiz-answer-key';
import {
    createQuizPublicIdCodec,
    encodePublicQuestionIds,
} from '@/entities/quiz-session/quiz-public-ids';
import type { QuizSessionPublicView } from '@/entities/quiz-session/quiz-session.types';

/**
 * Данные игры для браузера: ключ ответа в каждом вопросе Classic / Blitz /
 * Daily, `isCorrect` срезан (у Survival остаётся — принятый leak до его
 * перехода на lock-in), id → токены сессии, зафиксированные ответы — тоже
 * токенами. Вызывается только из findSnapshotPublicQuestionsForUser.
 * Canon: DECISIONS → Answer lock-in; Quiz answer leak.
 */
export function toBrowserPlayView(
    sessionId: string,
    view: QuizSessionPublicView,
): QuizSessionPublicView {
    const codec = createQuizPublicIdCodec(sessionId);
    const keepCorrectness = view.survival != null;

    const questions = view.questions.map((question) => {
        const correct = question.options.find((option) => option.isCorrect);
        const answerKey =
            !keepCorrectness && correct
                ? sealQuizAnswerKey({
                      sessionId,
                      questionId: question.id,
                      optionIds: question.options.map((option) => option.id),
                      correctOptionId: correct.id,
                  })
                : undefined;

        return {
            ...question,
            ...(answerKey ? { answerKey } : {}),
            options: question.options.map(({ isCorrect, ...option }) =>
                keepCorrectness ? { ...option, isCorrect } : option,
            ),
        };
    });

    return {
        ...view,
        questions: encodePublicQuestionIds(questions, codec),
        lockedAnswers: (view.lockedAnswers ?? []).map((answer) => ({
            questionId: codec.question(answer.questionId),
            selectedOptionId: codec.option(answer.selectedOptionId),
            correctOptionId: codec.option(answer.correctOptionId),
            isCorrect: answer.isCorrect,
        })),
    };
}
