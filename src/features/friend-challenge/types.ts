import type { QuizErrorCode } from '@/features/quiz/types';

/**
 * Ошибки старта «Вызова другу»: общие ошибки старта квиза + свои.
 * - CHALLENGE_EXPIRED — вызова нет или вопрос из набора удалён;
 * - CHALLENGE_OWN — свой вызов принять нельзя;
 * - CHALLENGE_USED — попытка уже израсходована (брошена).
 */
export type FriendChallengeErrorCode =
    | QuizErrorCode
    | 'CHALLENGE_EXPIRED'
    | 'CHALLENGE_OWN'
    | 'CHALLENGE_USED';

export type FriendChallengeStartState = {
    errorCode?: FriendChallengeErrorCode;
};
