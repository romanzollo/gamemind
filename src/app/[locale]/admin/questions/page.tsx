import Link from 'next/link';

import { questionRepository } from '@/entities/question/question.repository';
import { AdminQuestionsTable } from '@/features/admin/components/AdminQuestionsTable';
import { mapAdminQuestions } from '@/features/admin/lib';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';

type AdminQuestionsPageProps = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ error?: string }>;
};

function localizedHref(locale: Locale, href: string) {
    return `/${locale}${href}`;
}

export default async function AdminQuestionsPage({
    params,
    searchParams,
}: AdminQuestionsPageProps) {
    const { locale } = await params;
    const { error } = await searchParams;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireAdmin(safeLocale);

    const rows = await questionRepository.findAllForAdmin();
    const entries = mapAdminQuestions(rows);

    const deleteErrorMessage =
        error === 'DELETE_FAILED'
            ? dictionary.admin.errors.deleteFailed
            : undefined;

    return (
        <main className="mx-auto max-w-5xl p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl font-semibold">
                    {dictionary.admin.questionsTitle}
                </h1>

                <Link
                    href={localizedHref(safeLocale, '/admin/questions/new')}
                    className="rounded bg-neutral-900 px-4 py-2 text-sm text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                >
                    {dictionary.admin.createLink}
                </Link>
            </div>

            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.signedInAs} {session.user.username}.
            </p>

            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.listDescription}
            </p>

            {deleteErrorMessage && (
                <p className="mt-4 text-red-600" role="alert">
                    {deleteErrorMessage}
                </p>
            )}

            <AdminQuestionsTable
                entries={entries}
                labels={dictionary.admin}
                locale={safeLocale}
            />
        </main>
    );
}
