import Link from 'next/link';

import {
    activateUserAction,
    deactivateUserAction,
    deleteUserAction,
    updateUserRoleAction,
} from '@/features/admin/actions/users';
import { ConfirmForm } from '@/features/admin/components/ConfirmForm';
import type { Dictionary, Locale } from '@/shared/i18n';
import { EmptyState, SubmitButton } from '@/shared/ui';
import type { AdminUserListItem } from '../types';

/**
 * Список пользователей admin: Scoreboard Editorial.
 *
 * Тот же контракт, что AdminQuestionsTable (проверенный в продукте):
 * - &lt;lg: плотные surface-карточки, actions = text-links с wrap (без full-width CTA,
 *   без CSS-grid на 3 пункта — иначе «Удалить» сиротой на второй строке);
 * - lg+: таблица, sticky actions, nowrap как у вопросов.
 *
 * Имя пользователя = primary вход в detail; «Карточка» дублирует явно в actions.
 * Presentation only — guards / mutations / last-admin не трогаем.
 */

type AdminUsersTableProps = {
    entries: AdminUserListItem[];
    labels: Dictionary['admin'];
    locale: Locale;
    currentUserId: string;
};

/** Как у questions: компактный hit target, не full Button. */
const rowActionClassName =
    'inline-flex min-h-8 items-center rounded-sm px-0.5 text-sm font-medium underline-offset-2 motion-safe:transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function StatusBadge({
    isActive,
    labels,
}: {
    isActive: boolean;
    labels: Dictionary['admin'];
}) {
    return (
        <span
            className={
                isActive
                    ? 'text-xs font-medium text-success'
                    : 'text-xs font-medium text-muted'
            }
        >
            {isActive ? labels.statusActive : labels.statusInactive}
        </span>
    );
}

function RoleBadge({
    role,
    labels,
}: {
    role: AdminUserListItem['role'];
    labels: Dictionary['admin'];
}) {
    return (
        <span className="inline-flex rounded-sm bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wide text-foreground">
            {role === 'ADMIN' ? labels.roleAdmin : labels.roleUser}
        </span>
    );
}

function UserRowActions({
    entry,
    labels,
    locale,
    isSelf,
    nowrap = false,
}: {
    entry: AdminUserListItem;
    labels: Dictionary['admin'];
    locale: Locale;
    isSelf: boolean;
    nowrap?: boolean;
}) {
    const detailHref = `/${locale}/admin/users/${entry.id}`;

    return (
        <div
            className={
                nowrap
                    ? 'flex flex-nowrap items-center gap-x-3'
                    : 'flex flex-wrap items-center gap-x-4 gap-y-0.5'
            }
        >
            <Link
                href={detailHref}
                className={`${rowActionClassName} text-info hover:opacity-90`}
            >
                {labels.viewUserLink}
            </Link>

            {isSelf ? null : (
                <>
                    {entry.role === 'USER' ? (
                        <ConfirmForm
                            action={updateUserRoleAction}
                            message={labels.confirmChangeRole}
                            className="inline-flex"
                        >
                            <input
                                type="hidden"
                                name="locale"
                                value={locale}
                            />
                            <input
                                type="hidden"
                                name="userId"
                                value={entry.id}
                            />
                            <input type="hidden" name="role" value="ADMIN" />
                            <SubmitButton
                                unstyled
                                className={`${rowActionClassName} cursor-pointer text-primary hover:text-primary-hover`}
                            >
                                {labels.makeAdminButton}
                            </SubmitButton>
                        </ConfirmForm>
                    ) : (
                        <ConfirmForm
                            action={updateUserRoleAction}
                            message={labels.confirmChangeRole}
                            className="inline-flex"
                        >
                            <input
                                type="hidden"
                                name="locale"
                                value={locale}
                            />
                            <input
                                type="hidden"
                                name="userId"
                                value={entry.id}
                            />
                            <input type="hidden" name="role" value="USER" />
                            <SubmitButton
                                unstyled
                                className={`${rowActionClassName} cursor-pointer text-primary hover:text-primary-hover`}
                            >
                                {labels.makeUserButton}
                            </SubmitButton>
                        </ConfirmForm>
                    )}

                    {entry.isActive ? (
                        <form
                            action={deactivateUserAction}
                            className="inline-flex"
                        >
                            <input
                                type="hidden"
                                name="locale"
                                value={locale}
                            />
                            <input
                                type="hidden"
                                name="userId"
                                value={entry.id}
                            />
                            <SubmitButton
                                unstyled
                                className={`${rowActionClassName} cursor-pointer text-warning hover:opacity-90`}
                            >
                                {labels.deactivateButton}
                            </SubmitButton>
                        </form>
                    ) : (
                        <form
                            action={activateUserAction}
                            className="inline-flex"
                        >
                            <input
                                type="hidden"
                                name="locale"
                                value={locale}
                            />
                            <input
                                type="hidden"
                                name="userId"
                                value={entry.id}
                            />
                            <SubmitButton
                                unstyled
                                className={`${rowActionClassName} cursor-pointer text-success hover:opacity-90`}
                            >
                                {labels.activateButton}
                            </SubmitButton>
                        </form>
                    )}

                    <ConfirmForm
                        action={deleteUserAction}
                        message={labels.confirmDeleteUser}
                        className="inline-flex"
                    >
                        <input type="hidden" name="locale" value={locale} />
                        <input
                            type="hidden"
                            name="userId"
                            value={entry.id}
                        />
                        <SubmitButton
                            unstyled
                            className={`${rowActionClassName} cursor-pointer text-danger hover:opacity-90`}
                        >
                            {labels.deleteButton}
                        </SubmitButton>
                    </ConfirmForm>
                </>
            )}
        </div>
    );
}

function UserListCard({
    entry,
    labels,
    locale,
    isSelf,
}: {
    entry: AdminUserListItem;
    labels: Dictionary['admin'];
    locale: Locale;
    isSelf: boolean;
}) {
    const detailHref = `/${locale}/admin/users/${entry.id}`;
    const dateLocale = locale === 'en' ? 'en-US' : 'ru-RU';

    return (
        <li className="rounded-lg border border-border bg-surface px-3.5 py-3">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                        href={detailHref}
                        className="font-display text-base font-semibold tracking-tight text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                        {entry.username}
                    </Link>
                    <RoleBadge role={entry.role} labels={labels} />
                    <StatusBadge isActive={entry.isActive} labels={labels} />
                </div>
                <p className="mt-1 break-all text-sm text-muted">
                    {entry.email}
                </p>
                <p className="mt-1 text-xs text-muted">
                    <span>
                        {labels.tableQuizResults}:{' '}
                        <span className="font-mono tabular-nums text-foreground">
                            {entry.quizResultCount}
                        </span>
                    </span>
                    <span aria-hidden className="mx-1.5">
                        ·
                    </span>
                    <time className="font-mono tabular-nums">
                        {new Date(entry.createdAt).toLocaleDateString(
                            dateLocale,
                        )}
                    </time>
                </p>
            </div>

            {/* Как у questions: одна строка actions под контентом, без тяжёлой кнопки */}
            <div className="mt-2.5">
                <UserRowActions
                    entry={entry}
                    labels={labels}
                    locale={locale}
                    isSelf={isSelf}
                />
            </div>
        </li>
    );
}

export function AdminUsersTable({
    entries,
    labels,
    locale,
    currentUserId,
}: AdminUsersTableProps) {
    if (entries.length === 0) {
        return <EmptyState className="mt-6" title={labels.usersEmpty} />;
    }

    const dateLocale = locale === 'en' ? 'en-US' : 'ru-RU';

    return (
        <div className="mt-6">
            <ul className="space-y-3 lg:hidden">
                {entries.map((entry) => (
                    <UserListCard
                        key={entry.id}
                        entry={entry}
                        labels={labels}
                        locale={locale}
                        isSelf={entry.id === currentUserId}
                    />
                ))}
            </ul>

            <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface lg:block">
                <table className="w-full border-collapse text-left text-sm">
                    <thead>
                        <tr className="border-b border-border bg-surface-muted/50 text-muted">
                            <th className="px-4 py-2 font-medium">
                                {labels.tableUsername}
                            </th>
                            <th className="px-3 py-2 font-medium">
                                {labels.tableEmail}
                            </th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium">
                                {labels.tableRole}
                            </th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium">
                                {labels.tableStatus}
                            </th>
                            <th className="whitespace-nowrap px-3 py-2 font-medium">
                                {labels.tableQuizResults}
                            </th>
                            <th className="hidden whitespace-nowrap px-3 py-2 font-medium xl:table-cell">
                                {labels.tableCreated}
                            </th>
                            <th className="sticky right-0 bg-surface-muted/50 px-4 py-2 font-medium shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)]">
                                {labels.tableActions}
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {entries.map((entry) => {
                            const isSelf = entry.id === currentUserId;
                            const detailHref = `/${locale}/admin/users/${entry.id}`;

                            return (
                                <tr
                                    key={entry.id}
                                    className="group border-b border-border last:border-b-0 hover:bg-surface-hover/40"
                                >
                                    <td className="min-w-0 px-4 py-2.5 text-foreground">
                                        <Link
                                            href={detailHref}
                                            className="font-medium underline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                        >
                                            {entry.username}
                                        </Link>
                                    </td>
                                    <td className="max-w-[12rem] truncate px-3 py-2.5 text-muted xl:max-w-[16rem]">
                                        {entry.email}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                        <RoleBadge
                                            role={entry.role}
                                            labels={labels}
                                        />
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                        <StatusBadge
                                            isActive={entry.isActive}
                                            labels={labels}
                                        />
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-sm tabular-nums text-foreground">
                                        {entry.quizResultCount}
                                    </td>
                                    <td className="hidden whitespace-nowrap px-3 py-2.5 font-mono text-sm tabular-nums text-muted xl:table-cell">
                                        {new Date(
                                            entry.createdAt,
                                        ).toLocaleDateString(dateLocale)}
                                    </td>
                                    <td className="sticky right-0 whitespace-nowrap bg-surface px-4 py-2.5 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] group-hover:bg-surface-hover">
                                        <UserRowActions
                                            entry={entry}
                                            labels={labels}
                                            locale={locale}
                                            isSelf={isSelf}
                                            nowrap
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
