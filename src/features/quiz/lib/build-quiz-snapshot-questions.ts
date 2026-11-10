/**
 * Общий маппинг pick-bundle → snapshot questions (Classic / Timed).
 *
 * Shuffle вариантов — здесь, один раз на старт. Scoring читает optionId +
 * isCorrect из snapshot, не из live pool.
 *
 * AUDIO_GUESS: аудиовопрос не первый и не сразу после другого
 * (`arrangeAudioQuestions`) — к его показу уже был тап (звук на iOS) и клип
 * успел скачаться. Только порядок в памяти до INSERT, БД не трогаем.
 */

import type { QuestionSnapshotBundleItem } from '@/entities/question/question.types';
import type { SessionSnapshotQuestionInput } from '@/entities/quiz-session/quiz-session.types';
import { arrangeAudioQuestions } from '@/features/quiz/lib/listening-window';
import { shuffleArray } from '@/shared/utils';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

export function buildQuizSnapshotQuestions(
    pickedQuestions: QuestionSnapshotBundleItem[],
): SessionSnapshotQuestionInput[] {
    return arrangeAudioQuestions(pickedQuestions).map((question, index) => {
        const shuffledOptions = shuffleArray(question.options);

        return {
            questionId: question.id,
            position: index,
            displayText: question.displayText,
            displayTexts: question.displayTexts,
            displayImageUrl: normalizeQuizImageUrl(question.displayImageUrl),
            options: shuffledOptions.map((option, optionIndex) => ({
                optionId: option.id,
                displayOrder: optionIndex,
                displayText: option.displayText,
                displayTexts: option.displayTexts,
            })),
        };
    });
}
