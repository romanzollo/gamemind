import { redirect } from 'next/navigation';

import { LoginForm } from '@/features/auth/components/LoginForm';
import { OAuthSignIn } from '@/features/auth/components/OAuthSignIn';
import { getOAuthErrorMessage } from '@/features/auth/lib/get-oauth-error-message';
import { auth } from '@/lib/auth';
import { getDictionary, isLocale } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

type LoginPageProps = {
    params: Promise<{ locale: string }>;
    /** `?error=` — ошибка внешнего входа от Auth.js (pages.error). */
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({
    params,
    searchParams,
}: LoginPageProps) {
    const { locale: rawLocale } = await params;
    const { error } = await searchParams;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';

    // Ошибка у вошедшего игрока — это неудачная привязка входа из профиля
    // («Подключить»): Auth.js знает одну страницу ошибок, а показать её
    // надо там, где нажали кнопку.
    if (typeof error === 'string' && error !== '' && (await auth())?.user) {
        redirect(
            `/${locale}/profile?signInError=${encodeURIComponent(error)}`,
        );
    }

    const dictionary = getDictionary(locale);
    const oauthErrorMessage = getOAuthErrorMessage(dictionary, error);

    return (
        <main className="mx-auto max-w-md p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.auth.loginTitle}
            </h1>

            {oauthErrorMessage ? (
                <InlineAlert className="mt-4">{oauthErrorMessage}</InlineAlert>
            ) : null}

            <LoginForm locale={locale} />
            <OAuthSignIn locale={locale} />
        </main>
    );
}
