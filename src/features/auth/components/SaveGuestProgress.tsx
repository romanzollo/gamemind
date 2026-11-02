import Link from 'next/link';

import { OAuthSignIn } from '@/features/auth/components/OAuthSignIn';
import { getDictionary, type Locale } from '@/shared/i18n';
import { buttonClassName, InlineAlert } from '@/shared/ui';

type SaveGuestProgressProps = {
    locale: Locale;
    /** Ошибка внешнего входа (`?signInError=` в профиле). */
    errorMessage?: string | null;
    className?: string;
};

/**
 * «Сохрани прогресс» для гостя (3.4) — на результате и в профиле.
 * Server Component: показывают его только при `isGuest` из requireUser,
 * своих запросов нет. Регистрация оставляет ту же строку игрока, вход
 * через Яндекс / VK или по паролю переносит игры в аккаунт
 * (колбэк jwt в lib/auth). Canon: DECISIONS → Accounts without a password.
 */
export function SaveGuestProgress({
    locale,
    errorMessage,
    className = '',
}: SaveGuestProgressProps) {
    const dictionary = getDictionary(locale);

    return (
        <section
            className={`border border-border border-l-4 border-l-primary bg-surface p-4 sm:p-5 ${className}`.trim()}
            aria-labelledby="guest-save-title"
        >
            <h2
                id="guest-save-title"
                className="font-display text-lg font-semibold tracking-tight text-foreground"
            >
                {dictionary.auth.guestSaveTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">
                {dictionary.auth.guestSaveText}
            </p>

            {errorMessage ? (
                <InlineAlert className="mt-3">{errorMessage}</InlineAlert>
            ) : null}

            <div className="mt-4 flex flex-col">
                <Link
                    href={`/${locale}/register`}
                    className={buttonClassName()}
                >
                    {dictionary.auth.registerButton}
                </Link>
            </div>

            <OAuthSignIn locale={locale} />

            <p className="mt-4 text-sm text-muted">
                <Link href={`/${locale}/login`} className="underline">
                    {dictionary.auth.guestSaveSignIn}
                </Link>
            </p>
        </section>
    );
}
