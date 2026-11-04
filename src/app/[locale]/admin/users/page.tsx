import Link from 'next/link';
import { redirect } from 'next/navigation';

import { userRepository } from '@/entities/user/user.repository';
import { AdminListPagination } from '@/features/admin/components/AdminListPagination';
import { AdminUsersFilters } from '@/features/admin/components/AdminUsersFilters';
import { AdminUsersTable } from '@/features/admin/components/AdminUsersTable';
import {
    ADMIN_USER_LIST_PAGE_SIZE,
    buildAdminUserListHref,
    getAdminErrorMessage,
    getAdminQuestionListPageMeta,
    hasActiveAdminUserListFilters,
    mapAdminUsers,
    parseAdminUserListFilters,
} from '@/features/admin/lib';
import type { AdminErrorCode } from '@/features/admin/types';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { buttonClassName, InlineAlert } from '@/shared/ui';

type AdminUsersPageProps = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function localizedHref(locale: Locale, href: string) {
    return `/${locale}${href}`;
}

function parseAdminErrorCode(
    error: string | undefined,
): AdminErrorCode | undefined {
    if (!error) return undefined;

    const known: AdminErrorCode[] = [
        'NOT_FOUND',
        'DELETE_FAILED',
        'CANNOT_MODIFY_SELF',
        'CANNOT_DELETE_LAST_ADMIN',
        'CANNOT_PROMOTE_GUEST',
        'USER_UPDATE_FAILED',
        'USER_ROLE_UPDATE_FAILED',
        'USER_DEACTIVATE_FAILED',
        'USER_ACTIVATE_FAILED',
    ];

    return known.includes(error as AdminErrorCode)
        ? (error as AdminErrorCode)
        : undefined;
}

export default async function AdminUsersPage({
    params,
    searchParams,
}: AdminUsersPageProps) {
    const { locale } = await params;
    const rawSearchParams = await searchParams;
    const error = Array.isArray(rawSearchParams.error)
        ? rawSearchParams.error[0]
        : rawSearchParams.error;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireAdmin(safeLocale);

    const filters = parseAdminUserListFilters(rawSearchParams);

    let entries: ReturnType<typeof mapAdminUsers> = [];
    let totalCount = 0;
    let loadErrorMessage: string | undefined;

    try {
        const result = await userRepository.findPageForAdmin({
            q: filters.q,
            includeGuests: filters.guests,
            page: filters.page,
            pageSize: ADMIN_USER_LIST_PAGE_SIZE,
        });
        entries = mapAdminUsers(result.rows);
        totalCount = result.totalCount;
    } catch (loadError) {
        if (process.env.NODE_ENV === 'development') {
            console.error(
                '[admin/users] findPageForAdmin failed:',
                loadError instanceof Error ? loadError.message : loadError,
            );
        }
        loadErrorMessage = dictionary.admin.errors.usersLoadFailed;
    }

    // Та же математика страниц, что у вопросов (from/to/totalPages).
    const pageMeta = getAdminQuestionListPageMeta(
        totalCount,
        filters.page,
        ADMIN_USER_LIST_PAGE_SIZE,
    );

    // page за пределами (пользователей удалили) → последняя существующая.
    if (!loadErrorMessage && totalCount > 0 && pageMeta.page !== filters.page) {
        redirect(
            buildAdminUserListHref(safeLocale, {
                ...filters,
                page: pageMeta.page,
            }),
        );
    }

    const listHref = buildAdminUserListHref(safeLocale, filters);

    const actionErrorMessage = getAdminErrorMessage(
        dictionary,
        parseAdminErrorCode(error),
    );
    const adminErrorMessage = actionErrorMessage ?? loadErrorMessage;

    return (
        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                        {dictionary.admin.usersTitle}
                    </h1>
                    <p className="mt-2 text-sm text-muted sm:text-base">
                        {dictionary.admin.signedInAs} {session.user.username}.
                    </p>
                    <p className="mt-1 text-sm text-muted sm:text-base">
                        {dictionary.admin.usersListDescription}
                    </p>
                </div>

                {/* На узком экране кнопки на всю ширину — не обрезаются у края */}
                {/* Ряд из двух равных CTA — меньше вертикального «хвоста» на 320px */}
                <div className="flex w-full gap-2 sm:w-auto sm:flex-wrap sm:gap-3">
                    <Link
                        href={localizedHref(safeLocale, '/admin')}
                        className={buttonClassName({
                            variant: 'secondary',
                            className:
                                'min-h-10 flex-1 justify-center px-3 text-sm sm:min-h-11 sm:flex-none',
                        })}
                    >
                        {dictionary.admin.backToAdminHome}
                    </Link>
                    <Link
                        href={localizedHref(safeLocale, '/admin/questions')}
                        prefetch={false}
                        className={buttonClassName({
                            variant: 'ghost',
                            className:
                                'min-h-10 flex-1 justify-center px-3 text-sm sm:min-h-11 sm:flex-none',
                        })}
                    >
                        {dictionary.admin.questionsLink}
                    </Link>
                </div>
            </div>

            {adminErrorMessage ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <InlineAlert>{adminErrorMessage}</InlineAlert>
                    {loadErrorMessage ? (
                        <Link
                            href={listHref}
                            className="rounded-sm text-sm font-medium text-primary underline-offset-2 hover:underline hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                            {dictionary.admin.retryLoad}
                        </Link>
                    ) : null}
                </div>
            ) : null}

            <AdminUsersFilters
                locale={safeLocale}
                labels={dictionary.admin}
                filters={filters}
            />

            {!loadErrorMessage ? (
                <>
                    <AdminUsersTable
                        entries={entries}
                        labels={dictionary.admin}
                        locale={safeLocale}
                        currentUserId={session.user.id}
                        workingLabel={dictionary.common.working}
                        emptyTitle={
                            hasActiveAdminUserListFilters(filters)
                                ? dictionary.admin.usersEmptyFiltered
                                : undefined
                        }
                    />
                    <AdminListPagination
                        listHref={listHref}
                        navLabel={dictionary.admin.usersPaginationNavLabel}
                        page={pageMeta.page}
                        totalPages={pageMeta.totalPages}
                        totalCount={pageMeta.totalCount}
                        from={pageMeta.from}
                        to={pageMeta.to}
                        labels={dictionary.admin}
                        loadingLabel={dictionary.common.loading}
                    />
                </>
            ) : null}
        </main>
    );
}
