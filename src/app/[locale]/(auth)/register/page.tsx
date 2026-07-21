'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useActionState } from 'react';

import { registerAction } from '@/features/auth/actions';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

function getLocale(value: string | string[] | undefined): Locale {
    return typeof value === 'string' && isLocale(value) ? value : 'ru';
}

export default function RegisterPage() {
    const params = useParams<{ locale: string }>();
    const locale = getLocale(params.locale);
    const dictionary = getDictionary(locale);
    const [state, formAction] = useActionState(registerAction, {});

    return (
        <main className="mx-auto max-w-md p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.auth.registerTitle}
            </h1>
            <form action={formAction} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="locale" value={locale} />
                <input
                    name="username"
                    placeholder={dictionary.auth.username}
                    autoComplete="username"
                    required
                />
                <input
                    name="email"
                    type="email"
                    placeholder={dictionary.auth.email}
                    autoComplete="email"
                    required
                />
                <input
                    name="password"
                    type="password"
                    placeholder={dictionary.auth.password}
                    autoComplete="new-password"
                    required
                    minLength={8}
                />
                <input
                    name="confirmPassword"
                    type="password"
                    placeholder={dictionary.auth.confirmPassword}
                    autoComplete="new-password"
                    required
                    minLength={8}
                />
                <SubmitButton pendingLabel={dictionary.common.submitting}>
                    {dictionary.auth.registerButton}
                </SubmitButton>
            </form>
            {state.error ? (
                <InlineAlert className="mt-2">{state.error}</InlineAlert>
            ) : null}
            <p className="mt-4 text-sm text-muted">
                {dictionary.auth.haveAccount}{' '}
                <Link href={`/${locale}/login`} className="underline">
                    {dictionary.auth.loginLink}
                </Link>
            </p>
        </main>
    );
}
