'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useActionState } from 'react';

import { registerAction } from '@/features/auth/actions';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';

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
                    required
                />
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
                <button type="submit">{dictionary.auth.registerButton}</button>
            </form>
            {state.error && <p className="mt-2 text-red-600">{state.error}</p>}
            {state.success && (
                <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
                    {dictionary.auth.accountCreated}{' '}
                    <Link href={`/${locale}/login`} className="underline">
                        {dictionary.auth.loginLink}
                    </Link>
                </p>
            )}
        </main>
    );
}
