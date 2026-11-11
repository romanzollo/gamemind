'use client';

/**
 * Кнопки страницы вызова.
 * - ChallengeAcceptForm — вошедший игрок: «Принять вызов» → старт попытки.
 * - ChallengeGuestAccept — гость по ссылке: вход без регистрации и возврат
 *   на эту же страницу (`next`), дальше — та же кнопка «Принять вызов».
 * Client: нужны состояние формы и текст ошибки; проверки — на сервере.
 */

import { useActionState } from 'react';

import { guestSignInAction } from '@/features/auth/actions';
import { getAuthErrorMessage } from '@/features/auth/lib/get-auth-error-message';
import { startFriendChallengeAction } from '@/features/friend-challenge/actions/start-friend-challenge';
import { ChallengeMark } from '@/features/friend-challenge/components/FriendChallengeInvite';
import type { FriendChallengeErrorCode } from '@/features/friend-challenge/types';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import { getDictionary, type Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

function getStartErrorMessage(
    locale: Locale,
    errorCode: FriendChallengeErrorCode | undefined,
): string | undefined {
    const dictionary = getDictionary(locale);
    const errors = dictionary.friendChallenge.errors;

    switch (errorCode) {
        case undefined:
            return undefined;
        case 'CHALLENGE_EXPIRED':
            return errors.expired;
        case 'CHALLENGE_OWN':
            return errors.own;
        case 'CHALLENGE_USED':
            return errors.used;
        default:
            return getQuizErrorMessage(dictionary, errorCode);
    }
}

export function ChallengeAcceptForm({
    locale,
    challengeId,
}: {
    locale: Locale;
    challengeId: string;
}) {
    const dictionary = getDictionary(locale);
    const [state, formAction] = useActionState(startFriendChallengeAction, {});
    const errorMessage = getStartErrorMessage(locale, state.errorCode);

    return (
        <form action={formAction} className="mt-5 flex flex-col">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="challengeId" value={challengeId} />
            <SubmitButton
                pendingLabel={dictionary.common.working}
                className="w-full gap-2"
                data-testid="friend-challenge-accept"
            >
                <ChallengeMark />
                {dictionary.friendChallenge.accept}
            </SubmitButton>
            {errorMessage ? <InlineAlert className="mt-3">{errorMessage}</InlineAlert> : null}
        </form>
    );
}

export function ChallengeGuestAccept({
    locale,
    next,
}: {
    locale: Locale;
    next: string;
}) {
    const dictionary = getDictionary(locale);
    const [state, formAction] = useActionState(guestSignInAction, {});
    const errorMessage = getAuthErrorMessage(dictionary, state.errorCode);

    return (
        <form action={formAction} className="mt-5 flex flex-col">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="next" value={next} />
            <SubmitButton
                pendingLabel={dictionary.common.working}
                className="w-full"
                data-testid="friend-challenge-guest"
            >
                {dictionary.friendChallenge.acceptGuest}
            </SubmitButton>
            {errorMessage ? <InlineAlert className="mt-3">{errorMessage}</InlineAlert> : null}
        </form>
    );
}
