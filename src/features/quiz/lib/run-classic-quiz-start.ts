/**
 * Общая логика старта Classic (lobby + rematch).
 *
 * Без redirect / FormData — только pick → snapshot create.
 * Actions решают auth, rate limit, redirect и (для rematch) settle.
 */

import { questionRepository } from '@/entities/question/question.repository';
import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { mapQuizStartError } from '@/features/quiz/lib/map-quiz-start-error';
import type { QuizErrorCode } from '@/features/quiz/types';
import type { Locale } from '@/shared/i18n';
import { shuffleArray } from '@/shared/utils';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';
import type { Difficulty } from '@/types';

export type RunClassicQuizStartInput = {
    userId: string;
    difficulty: Difficulty;
    questionCount: number;
    locale: Locale;
};

export type RunClassicQuizStartResult =
    | { ok: true; sessionId: string }
    | { ok: false; errorCode: QuizErrorCode };

export async function runClassicQuizStart(
    input: RunClassicQuizStartInput,
): Promise<RunClassicQuizStartResult> {
    try {
        const pickedQuestions =
            await questionRepository.pickRandomActiveSnapshotBundle(
                input.difficulty,
                input.questionCount,
                input.locale,
            );

        if (pickedQuestions.length < input.questionCount) {
            return { ok: false, errorCode: 'NOT_ENOUGH_QUESTIONS' };
        }

        const snapshotQuestions = pickedQuestions.map((question, index) => {
            const shuffledOptions = shuffleArray(question.options);

            return {
                questionId: question.id,
                position: index,
                displayText: question.displayText,
                displayTexts: question.displayTexts,
                displayImageUrl: normalizeQuizImageUrl(
                    question.displayImageUrl,
                ),
                options: shuffledOptions.map((option, optionIndex) => ({
                    optionId: option.id,
                    displayOrder: optionIndex,
                    displayText: option.displayText,
                    displayTexts: option.displayTexts,
                })),
            };
        });

        const quizSession = await quizSessionRepository.createWithJsonSnapshot({
            userId: input.userId,
            difficulty: input.difficulty,
            questionCount: input.questionCount,
            sessionLocale: input.locale,
            questions: snapshotQuestions,
            pickedQuestions,
        });

        return { ok: true, sessionId: quizSession.id };
    } catch (error) {
        const errorCode = mapQuizStartError(error);
        if (errorCode === 'INVALID_SETUP') {
            console.error('Quiz session snapshot create failed:', error);
        } else {
            console.error('Quiz start failed:', errorCode, error);
        }
        return { ok: false, errorCode };
    }
}
