import Link from 'next/link';

import { userRepository } from '@/entities/user/user.repository';
import { AdminUsersTable } from '@/features/admin/components/AdminUsersTable';
import { getAdminErrorMessage, mapAdminUsers } from '@/features/admin/lib';
import type { AdminErrorCode } from '@/features/admin/types';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';

type AdminUsersPageProps = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ error?: string }>;
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
    const { error } = await searchParams;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireAdmin(safeLocale);

    let entries: ReturnType<typeof mapAdminUsers> = [];
    let loadErrorMessage: string | undefined;

    try {
        const rows = await userRepository.findAllForAdmin();
        entries = mapAdminUsers(rows);
    } catch (loadError) {
        if (process.env.NODE_ENV === 'development') {
            console.error(
                '[admin/users] findAllForAdmin failed:',
                loadError instanceof Error ? loadError.message : loadError,
            );
        }
        loadErrorMessage = dictionary.admin.errors.usersLoadFailed;
    }

    const actionErrorMessage = getAdminErrorMessage(
        dictionary,
        parseAdminErrorCode(error),
    );
    const adminErrorMessage = actionErrorMessage ?? loadErrorMessage;

    return (
        <main className="mx-auto max-w-5xl p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl font-semibold">
                    {dictionary.admin.usersTitle}
                </h1>

                <div className="flex flex-wrap gap-3">
                    <Link
                        href={localizedHref(safeLocale, '/admin')}
                        className="rounded border border-border px-4 py-2 text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                        {dictionary.admin.backToAdminHome}
                    </Link>
                    <Link
                        href={localizedHref(safeLocale, '/admin/questions')}
                        className="rounded border border-border px-4 py-2 text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                        {dictionary.admin.questionsLink}
                    </Link>
                </div>
            </div>

            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.signedInAs} {session.user.username}.
            </p>

            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.usersListDescription}
            </p>

            {adminErrorMessage && (
                <div
                    className="mt-4 flex flex-wrap items-center gap-3"
                    role="alert"
                >
                    <p className="text-red-600">{adminErrorMessage}</p>
                    {loadErrorMessage && (
                        <Link
                            href={localizedHref(safeLocale, '/admin/users')}
                            className="text-sm font-medium text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
                        >
                            {dictionary.admin.retryLoad}
                        </Link>
                    )}
                </div>
            )}

            <AdminUsersTable
                entries={entries}
                labels={dictionary.admin}
                locale={safeLocale}
                currentUserId={session.user.id}
            />
        </main>
    );
}
