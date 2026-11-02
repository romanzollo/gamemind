'use client';

import { useActionState } from 'react';

import { guestSignInAction } from '@/features/auth/actions';
import { getAuthErrorMessage } from '@/features/auth/lib/get-auth-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import {
    InlineAlert,
    PendingLink,
    SubmitButton,
    buttonClassName,
} from '@/shared/ui';

type GuestPlayPromptProps = {
    locale: Locale;
    dictionary: Dictionary;
};

/**
 * Посетитель без сессии там, где режим открыт гостям (Челлендж дня,
 * Классика): «Играть без регистрации» в одно касание + «Войти».
 * Гость создаётся на сервере (guestSignInAction, лимит с IP) и попадает
 * на главную — в то же место, откуда нажал (3.4).
 * Блиц и Выживание гостям закрыты — у них своё приглашение войти.
 */
export function GuestPlayPrompt({ locale, dictionary }: GuestPlayPromptProps) {
    const [state, formAction] = useActionState(guestSignInAction, {});
    const errorMessage = getAuthErrorMessage(dictionary, state.errorCode);

    return (
        <div className="flex w-full flex-col gap-2">
            <form action={formAction} className="flex flex-col">
                <input type="hidden" name="locale" value={locale} />
                <SubmitButton pendingLabel={dictionary.common.working}>
                    {dictionary.auth.guestButton}
                </SubmitButton>
            </form>
            <p className="text-sm text-muted">{dictionary.auth.guestHint}</p>
            <PendingLink
                href={`/${locale}/login`}
                className={buttonClassName({ variant: 'secondary' })}
            >
                {dictionary.nav.login}
            </PendingLink>

            {errorMessage ? <InlineAlert>{errorMessage}</InlineAlert> : null}
        </div>
    );
}
