import { OAuthSignIn } from '@/features/auth/components/OAuthSignIn';
import { RegisterForm } from '@/features/auth/components/RegisterForm';
import { getDictionary, isLocale } from '@/shared/i18n';

type RegisterPageProps = {
    params: Promise<{ locale: string }>;
};

export default async function RegisterPage({ params }: RegisterPageProps) {
    const { locale: rawLocale } = await params;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const dictionary = getDictionary(locale);

    return (
        <main className="mx-auto max-w-md p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.auth.registerTitle}
            </h1>

            <RegisterForm locale={locale} />
            <OAuthSignIn locale={locale} />
        </main>
    );
}
