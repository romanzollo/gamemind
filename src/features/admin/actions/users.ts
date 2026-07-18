'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { userRepository } from '@/entities/user/user.repository';
import { requireAdmin } from '@/lib/auth/guards';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

function getUserIdFromFormData(formData: FormData): string | null {
    const userId = formData.get('userId');

    if (typeof userId !== 'string' || userId.trim() === '') {
        return null;
    }

    return userId;
}

function usersPath(locale: Locale, error?: string) {
    if (error) {
        return `/${locale}/admin/users?error=${error}`;
    }

    return `/${locale}/admin/users`;
}

function isNextRedirectError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'digest' in error &&
        typeof (error as { digest: unknown }).digest === 'string' &&
        (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    );
}

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
    } catch (error) {
        if (isNextRedirectError(error)) throw error;
        redirect(usersPath(locale, 'USER_ROLE_UPDATE_FAILED'));
    }

    redirectMutationResult(locale, result);
}

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
    } catch (error) {
        if (isNextRedirectError(error)) throw error;
        if (process.env.NODE_ENV === 'development') {
            console.error(
                '[deactivateUserAction]',
                error instanceof Error ? error.message : error,
            );
        }
        redirect(usersPath(locale, 'USER_DEACTIVATE_FAILED'));
    }

    redirectMutationResult(locale, result);
}

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
    } catch (error) {
        if (isNextRedirectError(error)) throw error;
        redirect(usersPath(locale, 'USER_ACTIVATE_FAILED'));
    }

    redirectMutationResult(locale, result);
}

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
    } catch (error) {
        if (isNextRedirectError(error)) throw error;
        redirect(usersPath(locale, 'DELETE_FAILED'));
    }

    redirectMutationResult(locale, result);
}
