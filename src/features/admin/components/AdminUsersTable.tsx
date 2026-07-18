import {
    activateUserAction,
    deactivateUserAction,
    deleteUserAction,
    updateUserRoleAction,
} from '@/features/admin/actions/users';
import { ConfirmForm } from '@/features/admin/components/ConfirmForm';
import type { Dictionary, Locale } from '@/shared/i18n';
import type { AdminUserListItem } from '../types';

type AdminUsersTableProps = {
    entries: AdminUserListItem[];
    labels: Dictionary['admin'];
    locale: Locale;
    currentUserId: string;
};

export function AdminUsersTable({
    entries,
    labels,
    locale,
    currentUserId,
}: AdminUsersTableProps) {
    if (entries.length === 0) {
        return (
            <p className="mt-6 text-neutral-600 dark:text-neutral-400">
                {labels.usersEmpty}
            </p>
        );
    }

    return (
        <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-border text-neutral-500 dark:text-neutral-400">
                        <th className="py-2 pr-4">{labels.tableUsername}</th>
                        <th className="py-2 pr-4">{labels.tableEmail}</th>
                        <th className="py-2 pr-4">{labels.tableRole}</th>
                        <th className="py-2 pr-4">{labels.tableStatus}</th>
                        <th className="py-2 pr-4">{labels.tableQuizResults}</th>
                        <th className="py-2 pr-4">{labels.tableCreated}</th>
                        <th className="py-2">{labels.tableActions}</th>
                    </tr>
                </thead>

                <tbody>
                    {entries.map((entry) => {
                        const isSelf = entry.id === currentUserId;

                        return (
                            <tr
                                key={entry.id}
                                className="border-b border-border"
                            >
                                <td className="py-3 pr-4">{entry.username}</td>
                                <td className="py-3 pr-4">{entry.email}</td>
                                <td className="py-3 pr-4">
                                    {entry.role === 'ADMIN'
                                        ? labels.roleAdmin
                                        : labels.roleUser}
                                </td>
                                <td className="py-3 pr-4">
                                    {entry.isActive
                                        ? labels.statusActive
                                        : labels.statusInactive}
                                </td>
                                <td className="py-3 pr-4">
                                    {entry.quizResultCount}
                                </td>
                                <td className="py-3 pr-4">
                                    {new Date(
                                        entry.createdAt,
                                    ).toLocaleDateString()}
                                </td>
                                <td className="py-3">
                                    {isSelf ? (
                                        <span className="text-neutral-500 dark:text-neutral-400">
                                            —
                                        </span>
                                    ) : (
                                        <div className="flex flex-wrap items-center gap-3">
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
                                                    <button
                                                        type="submit"
                                                        className="cursor-pointer text-blue-600 transition-colors hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                                    >
                                                        {labels.makeAdminButton}
                                                    </button>
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
                                                    <button
                                                        type="submit"
                                                        className="cursor-pointer text-blue-600 transition-colors hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                                    >
                                                        {labels.makeUserButton}
                                                    </button>
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
                                                    <button
                                                        type="submit"
                                                        className="cursor-pointer text-amber-600 transition-colors hover:text-amber-800 hover:underline dark:text-amber-400 dark:hover:text-amber-300"
                                                    >
                                                        {
                                                            labels.deactivateButton
                                                        }
                                                    </button>
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
                                                    <button
                                                        type="submit"
                                                        className="cursor-pointer text-green-600 transition-colors hover:text-green-800 hover:underline dark:text-green-400 dark:hover:text-green-300"
                                                    >
                                                        {labels.activateButton}
                                                    </button>
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
                                                <button
                                                    type="submit"
                                                    className="cursor-pointer text-red-600 transition-colors hover:text-red-800 hover:underline dark:text-red-400 dark:hover:text-red-300"
                                                >
                                                    {labels.deleteButton}
                                                </button>
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
