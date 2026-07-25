import Link from 'next/link';
import { notFound } from 'next/navigation';

import { quizResultRepository } from '@/entities/quiz-result/quiz-result.repository';
import { userRepository } from '@/entities/user/user.repository';
import { AdminUserResultHistory } from '@/features/admin/components/AdminUserResultHistory';
import {
    ADMIN_USER_RESULT_HISTORY_LIMIT,
    mapAdminUserDetail,
    mapAdminUserResultHistory,
} from '@/features/admin/lib';
import type { AdminUserResultHistoryEntry } from '@/features/admin/types';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { InlineAlert, buttonClassName } from '@/shared/ui';

type AdminUserDetailPageProps = {
    params: Promise<{ locale: string; id: string }>;
};

function localizedHref(locale: Locale, href: string) {
    return `/${locale}${href}`;
}

/**
 * Карточка пользователя для support: профиль + недавние QuizResult.
 * Read-only — без смены роли/статуса (они остаются на списке).
 * История визуально как /profile; ссылок на /result нет (owner-only).
 */
export default async function AdminUserDetailPage({
    params,
}: AdminUserDetailPageProps) {
    const { locale, id } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    await requireAdmin(safeLocale);

    const rawUser = await userRepository.findByIdForAdmin(id);
    if (!rawUser) {
        notFound();
    }

    const user = mapAdminUserDetail(rawUser);

    let historyEntries: AdminUserResultHistoryEntry[] = [];
    let historyLoadError: string | undefined;

    try {
        const rows = await quizResultRepository.findRecentByUserId(
            user.id,
            ADMIN_USER_RESULT_HISTORY_LIMIT,
        );
        historyEntries = mapAdminUserResultHistory(rows);
    } catch (loadError) {
        if (process.env.NODE_ENV === 'development') {
            console.error(
                '[admin/users/[id]] findRecentByUserId failed:',
                loadError instanceof Error ? loadError.message : loadError,
            );
        }
        historyLoadError = dictionary.admin.userHistoryLoadFailed;
    }

    const dateLocale = safeLocale === 'en' ? 'en-US' : 'ru-RU';

    return (
        <main className="mx-auto max-w-5xl px-4 py-5 sm:px-8 sm:py-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                        {user.username}
                    </h1>
                    <p className="mt-2 text-sm text-muted sm:text-base">
                        {dictionary.admin.userDetailDescription}
                    </p>
                </div>

                <Link
                    href={localizedHref(safeLocale, '/admin/users')}
                    className={buttonClassName({
                        variant: 'secondary',
                        className: 'min-h-10 px-3 text-sm sm:min-h-11',
                    })}
                >
                    {dictionary.admin.backToUsers}
                </Link>
            </div>

            <dl className="mt-6 space-y-2 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="text-sm font-medium text-muted sm:w-40 sm:shrink-0">
                        {dictionary.admin.tableEmail}
                    </dt>
                    <dd className="break-all text-foreground">{user.email}</dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="text-sm font-medium text-muted sm:w-40 sm:shrink-0">
                        {dictionary.admin.tableRole}
                    </dt>
                    <dd className="text-foreground">
                        {user.role === 'ADMIN'
                            ? dictionary.admin.roleAdmin
                            : dictionary.admin.roleUser}
                    </dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="text-sm font-medium text-muted sm:w-40 sm:shrink-0">
                        {dictionary.admin.tableStatus}
                    </dt>
                    <dd className="text-foreground">
                        {user.isActive
                            ? dictionary.admin.statusActive
                            : dictionary.admin.statusInactive}
                    </dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="text-sm font-medium text-muted sm:w-40 sm:shrink-0">
                        {dictionary.admin.tableQuizResults}
                    </dt>
                    <dd className="font-mono tabular-nums text-foreground">
                        {user.quizResultCount}
                    </dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="text-sm font-medium text-muted sm:w-40 sm:shrink-0">
                        {dictionary.admin.tableCreated}
                    </dt>
                    <dd className="text-foreground">
                        {new Date(user.createdAt).toLocaleString(dateLocale)}
                    </dd>
                </div>
            </dl>

            <section className="mt-8 border-t border-border pt-6 sm:mt-10 sm:pt-8">
                <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {dictionary.admin.userHistoryTitle}
                </h2>

                {historyLoadError ? (
                    <div className="mt-4">
                        <InlineAlert>{historyLoadError}</InlineAlert>
                    </div>
                ) : (
                    <AdminUserResultHistory
                        entries={historyEntries}
                        locale={safeLocale}
                        labels={dictionary.admin}
                        difficultyLabels={dictionary.quiz}
                    />
                )}
            </section>
        </main>
    );
}
