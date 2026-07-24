import Link from 'next/link';

import { userRepository } from '@/entities/user/user.repository';
import { AdminUsersTable } from '@/features/admin/components/AdminUsersTable';
import { getAdminErrorMessage, mapAdminUsers } from '@/features/admin/lib';
import type { AdminErrorCode } from '@/features/admin/types';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { buttonClassName, InlineAlert } from '@/shared/ui';

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
        <main className="mx-auto max-w-5xl px-4 py-5 sm:px-8 sm:py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
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

                <div className="flex flex-wrap gap-2 sm:gap-3">
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
                        href={localizedHref(safeLocale, '/admin/questions')}
                        prefetch={false}
                        className={buttonClassName({
                            variant: 'ghost',
                            className: 'min-h-10 px-3 text-sm sm:min-h-11',
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
                            href={localizedHref(safeLocale, '/admin/users')}
                            className="rounded-sm text-sm font-medium text-primary underline-offset-2 hover:underline hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                            {dictionary.admin.retryLoad}
                        </Link>
                    ) : null}
                </div>
            ) : null}

            <AdminUsersTable
                entries={entries}
                labels={dictionary.admin}
                locale={safeLocale}
                currentUserId={session.user.id}
            />
        </main>
    );
}
