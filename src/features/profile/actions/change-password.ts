'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';

import { userRepository } from '@/entities/user/user.repository';
import { changePasswordSchema } from '@/features/profile/lib/validation';
import type { ProfileFormState } from '@/features/profile/types';
import { requireUser } from '@/lib/auth/guards';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

const BCRYPT_ROUNDS = 12;

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

export async function changePasswordAction(
    _prevState: ProfileFormState,
    formData: FormData,
): Promise<ProfileFormState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireUser(locale);

    const parsed = changePasswordSchema.safeParse({
        currentPassword: formData.get('currentPassword'),
        newPassword: formData.get('newPassword'),
        confirmNewPassword: formData.get('confirmNewPassword'),
    });

    if (!parsed.success) {
        const samePasswordIssue = parsed.error.issues.some(
            (issue) =>
                issue.path[0] === 'newPassword' &&
                issue.message.includes('different from the current'),
        );

        if (samePasswordIssue) {
            return { errorCode: 'SAME_PASSWORD' };
        }

        return { errorCode: 'INVALID_INPUT' };
    }

    const { currentPassword, newPassword } = parsed.data;

    try {
        const status = await userRepository.changePasswordHash(
            session.user.id,
            {
                isCurrentPasswordValid: (passwordHash) =>
                    bcrypt.compare(currentPassword, passwordHash),
                hashNewPassword: () =>
                    bcrypt.hash(newPassword, BCRYPT_ROUNDS),
            },
        );

        if (status === 'wrong_password') {
            return { errorCode: 'WRONG_CURRENT_PASSWORD' };
        }

        if (status === 'not_found' || status === 'missing_hash') {
            return { errorCode: 'UPDATE_FAILED' };
        }
    } catch (error) {
        console.error('Change password failed:', error);
        return { errorCode: 'UPDATE_FAILED' };
    }

    revalidatePath(`/${locale}/profile`);

    return { success: true };
}
