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

type AdminUsersTableProps = {
    entries: AdminUserListItem[];
    labels: Dictionary['admin'];
    locale: Locale;
    currentUserId: string;
};

/** Плотные текстовые действия в строке таблицы (не full Button). */
const rowActionClassName =
    'rounded-sm text-sm font-medium underline-offset-2 motion-safe:transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function AdminUsersTable({
    entries,
    labels,
    locale,
    currentUserId,
}: AdminUsersTableProps) {
    if (entries.length === 0) {
        return <EmptyState className="mt-6" title={labels.usersEmpty} />;
    }

    return (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-border bg-surface-muted/50 text-muted">
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableUsername}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableEmail}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableRole}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableStatus}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableQuizResults}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableCreated}
                        </th>
                        <th className="px-3 py-2 font-medium sm:px-4">
                            {labels.tableActions}
                        </th>
                    </tr>
                </thead>

                <tbody>
                    {entries.map((entry) => {
                        const isSelf = entry.id === currentUserId;

                        return (
                            <tr
                                key={entry.id}
                                className="border-b border-border last:border-b-0 hover:bg-surface-hover/40"
                            >
                                <td className="px-3 py-2 text-foreground sm:px-4">
                                    {entry.username}
                                </td>
                                <td className="px-3 py-2 text-muted sm:px-4">
                                    {entry.email}
                                </td>
                                <td className="px-3 py-2 text-foreground sm:px-4">
                                    {entry.role === 'ADMIN'
                                        ? labels.roleAdmin
                                        : labels.roleUser}
                                </td>
                                <td className="px-3 py-2 sm:px-4">
                                    <span
                                        className={
                                            entry.isActive
                                                ? 'font-medium text-success'
                                                : 'font-medium text-muted'
                                        }
                                    >
                                        {entry.isActive
                                            ? labels.statusActive
                                            : labels.statusInactive}
                                    </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-xs tabular-nums text-foreground sm:px-4 sm:text-sm">
                                    {entry.quizResultCount}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted sm:px-4 sm:text-sm">
                                    {new Date(
                                        entry.createdAt,
                                    ).toLocaleDateString()}
                                </td>
                                <td className="px-3 py-2 sm:px-4">
                                    {isSelf ? (
                                        <span
                                            className="text-muted"
                                            aria-hidden="true"
                                        >
                                            —
                                        </span>
                                    ) : (
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            {entry.role === 'USER' ? (
                                                <ConfirmForm
                                                    action={updateUserRoleAction}
                                                    message={
                                                        labels.confirmChangeRole
                                                    }
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
                                                    <input
                                                        type="hidden"
                                                        name="role"
                                                        value="ADMIN"
                                                    />
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
                                                    message={
                                                        labels.confirmChangeRole
                                                    }
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
                                                    <input
                                                        type="hidden"
                                                        name="role"
                                                        value="USER"
                                                    />
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
                                                        {
                                                            labels.deactivateButton
                                                        }
                                                    </SubmitButton>
                                                </form>
                                            ) : (
                                                <form
                                                    action={activateUserAction}
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
                                                message={
                                                    labels.confirmDeleteUser
                                                }
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
                                                    className={`${rowActionClassName} cursor-pointer text-danger hover:opacity-90`}
                                                >
                                                    {labels.deleteButton}
                                                </SubmitButton>
                                            </ConfirmForm>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
