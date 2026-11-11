'use client';

import { useActionState } from 'react';

import { guestSignInAction } from '@/features/auth/actions';
import { getAuthErrorMessage } from '@/features/auth/lib/get-auth-error-message';
import { getDictionary, type Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

/**
 * «Играть без регистрации» под формой входа / регистрации (3.4).
 * Client: нужен текст ошибки лимита из useActionState; создание гостя
 * и проверка лимита — на сервере (guestSignInAction → провайдер `guest`).
 */
export function GuestSignIn({
    locale,
    next = null,
}: {
    locale: Locale;
    /** Проверенный путь возврата (страница вызова); null — на главную. */
    next?: string | null;
}) {
    const dictionary = getDictionary(locale);
    const [state, formAction] = useActionState(guestSignInAction, {});
    const errorMessage = getAuthErrorMessage(dictionary, state.errorCode);

    return (
        <div className="mt-6 border-t border-border pt-6">
            <form action={formAction} className="flex flex-col">
                <input type="hidden" name="locale" value={locale} />
                {next ? <input type="hidden" name="next" value={next} /> : null}
                <SubmitButton
                    variant="secondary"
                    pendingLabel={dictionary.auth.guestButton}
                >
                    {dictionary.auth.guestButton}
                </SubmitButton>
            </form>
            <p className="mt-2 text-sm text-muted">
                {dictionary.auth.guestHint}
            </p>

            {errorMessage ? (
                <InlineAlert className="mt-2">{errorMessage}</InlineAlert>
            ) : null}
        </div>
    );
}
