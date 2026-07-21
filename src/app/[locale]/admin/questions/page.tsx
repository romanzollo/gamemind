import Link from 'next/link';

import { questionRepository } from '@/entities/question/question.repository';
import { AdminQuestionsTable } from '@/features/admin/components/AdminQuestionsTable';
import { mapAdminQuestions } from '@/features/admin/lib';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

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

    let entries: ReturnType<typeof mapAdminQuestions> = [];
    let loadErrorMessage: string | undefined;

    try {
        const startedAt = Date.now();
        const rows = await questionRepository.findAllForAdmin(safeLocale);
        entries = mapAdminQuestions(rows);

        if (process.env.NODE_ENV === 'development') {
            console.info(
                `[admin/questions] findAllForAdmin ok in ${Date.now() - startedAt}ms (rows=${rows.length})`,
            );
        }
    } catch (loadError) {
        if (process.env.NODE_ENV === 'development') {
            console.error(
                '[admin/questions] findAllForAdmin failed:',
                loadError instanceof Error ? loadError.message : loadError,
            );
        }
        loadErrorMessage = dictionary.admin.errors.loadFailed;
    }

    const actionErrorMessage =
        error === 'DELETE_FAILED'
            ? dictionary.admin.errors.deleteFailed
            : error === 'DEACTIVATE_FAILED'
              ? dictionary.admin.errors.deactivateFailed
              : error === 'ACTIVATE_FAILED'
                ? dictionary.admin.errors.activateFailed
                : error === 'NOT_FOUND'
                  ? dictionary.admin.errors.notFound
                  : undefined;
    const adminErrorMessage = actionErrorMessage ?? loadErrorMessage;

    return (
        <main className="mx-auto max-w-5xl p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl font-semibold">
                    {dictionary.admin.questionsTitle}
                </h1>

                <div className="flex flex-wrap gap-3">
                    <Link
                        href={localizedHref(safeLocale, '/admin')}
                        className="rounded border border-border px-4 py-2 text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                        {dictionary.admin.backToAdminHome}
                    </Link>
                    <Link
                        href={localizedHref(safeLocale, '/admin/users')}
                        className="rounded border border-border px-4 py-2 text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                        {dictionary.admin.usersLink}
                    </Link>
                    <Link
                        href={localizedHref(safeLocale, '/admin/questions/new')}
                        className="rounded bg-neutral-900 px-4 py-2 text-sm text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                    >
                        {dictionary.admin.createLink}
                    </Link>
                </div>
            </div>

            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.signedInAs} {session.user.username}.
            </p>

            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.listDescription}
            </p>

            {adminErrorMessage ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <InlineAlert>{adminErrorMessage}</InlineAlert>
                    {loadErrorMessage ? (
                        <Link
                            href={localizedHref(safeLocale, '/admin/questions')}
                            className="text-sm font-medium text-primary underline hover:text-primary-hover"
                        >
                            {dictionary.admin.retryLoad}
                        </Link>
                    ) : null}
                </div>
            ) : null}

            <AdminQuestionsTable
                entries={entries}
                labels={dictionary.admin}
                locale={safeLocale}
            />
        </main>
    );
}
