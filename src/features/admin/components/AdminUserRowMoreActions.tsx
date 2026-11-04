'use client';

/**
 * Меню «⋯» строки списка пользователей — роль, витрина, удаление.
 * На виду в строке остаётся только «Карточка» (как «Править» у вопросов):
 * ряд из четырёх ссылок не помещался в таблицу на компьютере и ставил
 * «Удалить» под палец на телефоне.
 *
 * Client + прямой import Server Actions: формы внутри портала AdminRowMoreMenu
 * надёжнее биндят action, чем RSC-children (см. AdminQuestionRowMoreActions).
 * Права и запреты (себя, последнего ADMIN, гостя в ADMIN) проверяет сервер;
 * здесь только не показываем заведомо лишнее.
 */

import {
    activateUserAction,
    deactivateUserAction,
    deleteUserAction,
    updateUserRoleAction,
} from '@/features/admin/actions/users';
import { AdminRowMoreMenu } from '@/features/admin/components/AdminRowMoreMenu';
import { ConfirmForm } from '@/features/admin/components/ConfirmForm';
import type { AdminUserListItem } from '@/features/admin/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';

const menuActionClassName =
    'inline-flex w-full min-h-8 cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm font-medium motion-safe:transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function HiddenFields({ locale, userId }: { locale: Locale; userId: string }) {
    return (
        <>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="userId" value={userId} />
        </>
    );
}

export function AdminUserRowMoreActions({
    entry,
    locale,
    labels,
    workingLabel,
}: {
    entry: AdminUserListItem;
    locale: Locale;
    labels: Dictionary['admin'];
    workingLabel: string;
}) {
    // Гостю ADMIN не выдаём — сервер тоже откажет (updateRoleForAdmin).
    const canToggleRole = !(entry.isGuest && entry.role === 'USER');

    return (
        <AdminRowMoreMenu label={labels.rowMoreActions}>
            {canToggleRole ? (
                <ConfirmForm
                    action={updateUserRoleAction}
                    message={labels.confirmChangeRole}
                    className="block w-full"
                >
                    <HiddenFields locale={locale} userId={entry.id} />
                    <input
                        type="hidden"
                        name="role"
                        value={entry.role === 'USER' ? 'ADMIN' : 'USER'}
                    />
                    <SubmitButton
                        unstyled
                        pendingLabel={workingLabel}
                        className={`${menuActionClassName} text-primary`}
                    >
                        {entry.role === 'USER'
                            ? labels.makeAdminButton
                            : labels.makeUserButton}
                    </SubmitButton>
                </ConfirmForm>
            ) : null}

            <form
                action={entry.isActive ? deactivateUserAction : activateUserAction}
                className="block w-full"
            >
                <HiddenFields locale={locale} userId={entry.id} />
                <SubmitButton
                    unstyled
                    pendingLabel={workingLabel}
                    className={`${menuActionClassName} ${entry.isActive ? 'text-warning' : 'text-success'}`}
                >
                    {entry.isActive
                        ? labels.deactivateButton
                        : labels.activateButton}
                </SubmitButton>
            </form>

            <ConfirmForm
                action={deleteUserAction}
                message={labels.confirmDeleteUser}
                className="block w-full"
            >
                <HiddenFields locale={locale} userId={entry.id} />
                <SubmitButton
                    unstyled
                    pendingLabel={workingLabel}
                    className={`${menuActionClassName} text-danger`}
                >
                    {labels.deleteButton}
                </SubmitButton>
            </ConfirmForm>
        </AdminRowMoreMenu>
    );
}
