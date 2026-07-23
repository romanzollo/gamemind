import Link from 'next/link';

import { questionRepository } from '@/entities/question/question.repository';
import { AdminQuestionsFilters } from '@/features/admin/components/AdminQuestionsFilters';
import { AdminQuestionsTable } from '@/features/admin/components/AdminQuestionsTable';
import {
    hasActiveAdminQuestionListFilters,
    mapAdminQuestions,
    parseAdminQuestionListFilters,
} from '@/features/admin/lib';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { buttonClassName, InlineAlert } from '@/shared/ui';

type AdminQuestionsPageProps = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function localizedHref(locale: Locale, href: string) {
    return `/${locale}${href}`;
}

export default async function AdminQuestionsPage({
    params,
    searchParams,
}: AdminQuestionsPageProps) {
    const { locale } = await params;
    const rawSearchParams = await searchParams;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireAdmin(safeLocale);

    const filters = parseAdminQuestionListFilters(rawSearchParams);
    const filtersActive = hasActiveAdminQuestionListFilters(filters);
    const error = Array.isArray(rawSearchParams.error)
        ? rawSearchParams.error[0]
        : rawSearchParams.error;

    let entries: ReturnType<typeof mapAdminQuestions> = [];
    let loadErrorMessage: string | undefined;

    try {
        const startedAt = Date.now();
        const rows = await questionRepository.findAllForAdmin(
            safeLocale,
            filters,
        );
        entries = mapAdminQuestions(rows);

        if (process.env.NODE_ENV === 'development') {
            console.info(
                `[admin/questions] findAllForAdmin ok in ${Date.now() - startedAt}ms (rows=${rows.length}, filtersActive=${filtersActive})`,
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
        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                        {dictionary.admin.questionsTitle}
                    </h1>
                    <p className="mt-2 text-sm text-muted sm:text-base">
                        {dictionary.admin.signedInAs} {session.user.username}.
                    </p>
                    <p className="mt-1 text-sm text-muted sm:text-base">
                        {dictionary.admin.listDescription}
                    </p>
                </div>

                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:gap-3">
                    <Link
                        href={localizedHref(safeLocale, '/admin')}
                        className={buttonClassName({
                            variant: 'secondary',
                            className: 'min-h-10 px-3 text-sm sm:min-h-11',
                        })}
                    >
                        {dictionary.admin.backToAdminHome}
                    </Link>
                    <Link
                        href={localizedHref(safeLocale, '/admin/users')}
                        className={buttonClassName({
                            variant: 'ghost',
                            className: 'min-h-10 px-3 text-sm sm:min-h-11',
                        })}
                    >
                        {dictionary.admin.usersLink}
                    </Link>
                    <Link
                        href={localizedHref(safeLocale, '/admin/questions/new')}
                        className={buttonClassName({
                            className:
                                'min-h-10 w-full px-3 text-sm sm:min-h-11 sm:w-auto',
                        })}
                    >
                        {dictionary.admin.createLink}
                    </Link>
                </div>
            </div>

            {adminErrorMessage ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <InlineAlert>{adminErrorMessage}</InlineAlert>
                    {loadErrorMessage ? (
                        <Link
                            href={localizedHref(safeLocale, '/admin/questions')}
                            className="rounded-sm text-sm font-medium text-primary underline-offset-2 hover:underline hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                            {dictionary.admin.retryLoad}
                        </Link>
                    ) : null}
                </div>
            ) : null}

            <AdminQuestionsFilters
                locale={safeLocale}
                labels={dictionary.admin}
                difficultyLabels={{
                    easy: dictionary.quiz.easy,
                    medium: dictionary.quiz.medium,
                    hard: dictionary.quiz.hard,
                }}
                filters={filters}
            />

            {!loadErrorMessage ? (
                <AdminQuestionsTable
                    entries={entries}
                    labels={dictionary.admin}
                    locale={safeLocale}
                    emptyTitle={
                        filtersActive
                            ? dictionary.admin.emptyFiltered
                            : dictionary.admin.empty
                    }
                />
            ) : null}        </main>
    );
}
