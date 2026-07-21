'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useActionState } from 'react';

import { loginAction } from '@/features/auth/actions';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

function getLocale(value: string | string[] | undefined): Locale {
    return typeof value === 'string' && isLocale(value) ? value : 'ru';
}

export default function LoginPage() {
    const params = useParams<{ locale: string }>();
    const locale = getLocale(params.locale);
    const dictionary = getDictionary(locale);
    const [state, formAction] = useActionState(loginAction, {});

    return (
        <main className="mx-auto max-w-md p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.auth.loginTitle}
            </h1>

            <form action={formAction} className="mt-4 flex flex-col gap-3">
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

            {state.error ? (
                <InlineAlert className="mt-2">{state.error}</InlineAlert>
            ) : null}

            <p className="mt-4 text-sm text-muted">
                {dictionary.auth.noAccount}{' '}
                <Link href={`/${locale}/register`} className="underline">
                    {dictionary.auth.registerLink}
                </Link>
            </p>
        </main>
    );
}
