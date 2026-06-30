import type { QuizErrorCode } from '../types';
import type { Dictionary } from '@/shared/i18n';

const ERROR_MAP: Record<QuizErrorCode, keyof Dictionary['quiz']['errors']> = {
    INVALID_SETUP: 'invalidSetup',
    NOT_ENOUGH_QUESTIONS: 'notEnoughQuestions',
    ANSWER_ALL: 'answerAll',
    INVALID_ANSWER: 'invalidAnswer',
    SUBMIT_FAILED: 'submitFailed',
};

export function getQuizErrorMessage(
    dictionary: Dictionary,
    errorCode?: QuizErrorCode,
): string | undefined {
    if (!errorCode) return undefined;

    const key = ERROR_MAP[errorCode];
    return dictionary.quiz.errors[key];
}
