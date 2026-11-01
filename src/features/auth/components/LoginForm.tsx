'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { loginAction } from '@/features/auth/actions';
import { getAuthErrorMessage } from '@/features/auth/lib/get-auth-error-message';
import { getDictionary, type Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

/** Вход по почте и паролю. Внешний вход — отдельный серверный блок рядом. */
export function LoginForm({ locale }: { locale: Locale }) {
    const dictionary = getDictionary(locale);
    const [state, formAction] = useActionState(loginAction, {});
    const errorMessage = getAuthErrorMessage(dictionary, state.errorCode);

    return (
        <>
            <form
                action={formAction}
                className="mt-4 flex flex-col gap-3"
                data-testid="login-form"
            >
                <input type="hidden" name="locale" value={locale} />
                <input
                    name="email"
                    type="email"
                    placeholder={dictionary.auth.email}
                    required
                />
                <input
                    name="password"
                    type="password"
                    placeholder={dictionary.auth.password}
                    required
                />
                <SubmitButton pendingLabel={dictionary.common.submitting}>
                    {dictionary.auth.loginButton}
                </SubmitButton>
            </form>

            {errorMessage ? (
                <InlineAlert className="mt-2">{errorMessage}</InlineAlert>
            ) : null}

            <p className="mt-4 text-sm text-muted">
                {dictionary.auth.noAccount}{' '}
                <Link href={`/${locale}/register`} className="underline">
                    {dictionary.auth.registerLink}
                </Link>
            </p>
        </>
    );
}
