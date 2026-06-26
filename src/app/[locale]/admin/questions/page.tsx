import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

type AdminQuestionsPageProps = {
    params: Promise<{ locale: string }>;
};

export default async function AdminQuestionsPage({
    params,
}: AdminQuestionsPageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireAdmin(safeLocale);

    return (
        <main className="mx-auto max-w-3xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.admin.questionsTitle}
            </h1>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.signedInAs} {session.user.username}.
            </p>
        </main>
    );
}
