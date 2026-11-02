import { GuestSignIn } from '@/features/auth/components/GuestSignIn';
import { OAuthSignIn } from '@/features/auth/components/OAuthSignIn';
import { RegisterForm } from '@/features/auth/components/RegisterForm';
import { GUEST_MODES_LOCKED_REASON } from '@/features/auth/lib/guest';
import { auth } from '@/lib/auth';
import { getDictionary, isLocale } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

type RegisterPageProps = {
    params: Promise<{ locale: string }>;
    /** `?reason=guest-modes` — гость пытался открыть Блиц / Выживание. */
    searchParams: Promise<{ reason?: string | string[] }>;
};

export default async function RegisterPage({
    params,
    searchParams,
}: RegisterPageProps) {
    const { locale: rawLocale } = await params;
    const { reason } = await searchParams;
    const session = await auth();
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const dictionary = getDictionary(locale);

    return (
        <main className="mx-auto max-w-md p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.auth.registerTitle}
            </h1>

            {reason === GUEST_MODES_LOCKED_REASON ? (
                <InlineAlert className="mt-4" tone="info" role="status">
                    {dictionary.auth.guestModesLocked}
                </InlineAlert>
            ) : session?.user.isGuest ? (
                // Регистрация гостя оставляет ту же строку (registerAction).
                <InlineAlert className="mt-4" tone="info" role="status">
                    {dictionary.auth.guestRegisterHint}
                </InlineAlert>
            ) : null}

            <RegisterForm locale={locale} />
            <OAuthSignIn locale={locale} />
            {session?.user ? null : <GuestSignIn locale={locale} />}
        </main>
    );
}
