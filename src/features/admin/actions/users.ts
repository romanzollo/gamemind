'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { userRepository } from '@/entities/user/user.repository';
import { requireAdmin } from '@/lib/auth/guards';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

/** Получение локали из формы */
function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

/** Получение ID пользователя из формы */
function getUserIdFromFormData(formData: FormData): string | null {
    const userId = formData.get('userId');

    if (typeof userId !== 'string' || userId.trim() === '') {
        return null;
    }

    return userId;
}

/** Генерация пути для админки пользователей с ошибкой (если есть) */
function usersPath(locale: Locale, error?: string) {
    if (error) {
        return `/${locale}/admin/users?error=${error}`;
    }

    return `/${locale}/admin/users`;
}

/** Перенаправление после успешной или неудачной операции */
function redirectMutationResult(
    locale: Locale,
    result:
        | 'updated'
        | 'deleted'
        | 'not_found'
        | 'unchanged'
        | 'cannot_modify_self'
        | 'cannot_delete_last_admin'
        | null,
) {
    if (!result || result === 'not_found') {
        redirect(usersPath(locale, 'NOT_FOUND'));
    }

    if (result === 'cannot_modify_self') {
        redirect(usersPath(locale, 'CANNOT_MODIFY_SELF'));
    }

    if (result === 'cannot_delete_last_admin') {
        redirect(usersPath(locale, 'CANNOT_DELETE_LAST_ADMIN'));
    }

    revalidatePath(`/${locale}/admin/users`);
    redirect(usersPath(locale));
}

/** Действие для обновления роли пользователя */
export async function updateUserRoleAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    const session = await requireAdmin(locale);
    const userId = getUserIdFromFormData(formData);
    const roleRaw = formData.get('role');
    const nextRole =
        roleRaw === 'ADMIN' ? 'ADMIN' : roleRaw === 'USER' ? 'USER' : null;

    if (!userId || !nextRole) {
        redirect(usersPath(locale));
    }

    let result: Awaited<
        ReturnType<typeof userRepository.updateRoleForAdmin>
    > | null = null;

    try {
        result = await userRepository.updateRoleForAdmin(
            userId,
            nextRole,
            session.user.id,
        );
    } catch {
        redirect(usersPath(locale, 'USER_ROLE_UPDATE_FAILED'));
    }

    redirectMutationResult(locale, result);
}

/** Действие для деактивации пользователя */
export async function deactivateUserAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    const session = await requireAdmin(locale);
    const userId = getUserIdFromFormData(formData);

    if (!userId) {
        redirect(usersPath(locale));
    }

    let result: Awaited<
        ReturnType<typeof userRepository.setActiveForAdmin>
    > | null = null;

    try {
        result = await userRepository.setActiveForAdmin(
            userId,
            false,
            session.user.id,
        );
    } catch {
        redirect(usersPath(locale, 'USER_DEACTIVATE_FAILED'));
    }

    redirectMutationResult(locale, result);
}

/** Действие для активации пользователя */
export async function activateUserAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    const session = await requireAdmin(locale);
    const userId = getUserIdFromFormData(formData);

    if (!userId) {
        redirect(usersPath(locale));
    }

    let result: Awaited<
        ReturnType<typeof userRepository.setActiveForAdmin>
    > | null = null;

    try {
        result = await userRepository.setActiveForAdmin(
            userId,
            true,
            session.user.id,
        );
    } catch {
        redirect(usersPath(locale, 'USER_ACTIVATE_FAILED'));
    }

    redirectMutationResult(locale, result);
}

/** Действие для удаления пользователя */
export async function deleteUserAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    const session = await requireAdmin(locale);
    const userId = getUserIdFromFormData(formData);

    if (!userId) {
        redirect(usersPath(locale));
    }

    let result: Awaited<
        ReturnType<typeof userRepository.deleteByIdForAdmin>
    > | null = null;

    try {
        result = await userRepository.deleteByIdForAdmin(
            userId,
            session.user.id,
        );
    } catch {
        redirect(usersPath(locale, 'DELETE_FAILED'));
    }

    redirectMutationResult(locale, result);
}
