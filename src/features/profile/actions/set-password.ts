'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';

import { userRepository } from '@/entities/user/user.repository';
import { createSetPasswordSchema } from '@/features/profile/lib/validation';
import type { ProfileFormState } from '@/features/profile/types';
import { requireUser } from '@/lib/auth/guards';
import { checkSharedPresetRateLimit } from '@/lib/rate-limit-shared';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

const BCRYPT_ROUNDS = 12;

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

/**
 * «Задать пароль» для аккаунта, созданного через Яндекс / VK ID.
 *
 * Нужна ли почта, решает сервер по БД, а не скрытое поле формы. Лимит —
 * тот же `password`, что у смены пароля, и до bcrypt. Запись — одним
 * условным UPDATE (`setInitialPassword`): существующий пароль так не
 * перезаписать. Canon: DECISIONS → Accounts without a password.
 */
export async function setPasswordAction(
    _prevState: ProfileFormState,
    formData: FormData,
): Promise<ProfileFormState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireUser(locale);

    const rate = await checkSharedPresetRateLimit(
        'password',
        getUserRateLimitIdentity(session.user.id),
    );
    if (!rate.ok) {
        return { errorCode: 'RATE_LIMITED' };
    }

    const methods = await userRepository.findSignInMethods(session.user.id);
    if (!methods || methods.hasPassword) {
        return { errorCode: 'UPDATE_FAILED' };
    }

    const parsed = createSetPasswordSchema(methods.email === null).safeParse({
        email: formData.get('email') ?? undefined,
        newPassword: formData.get('newPassword'),
        confirmNewPassword: formData.get('confirmNewPassword'),
    });

    if (!parsed.success) {
        return { errorCode: 'INVALID_INPUT' };
    }

    try {
        const status = await userRepository.setInitialPassword(
            session.user.id,
            {
                email: parsed.data.email ?? null,
                passwordHash: await bcrypt.hash(
                    parsed.data.newPassword,
                    BCRYPT_ROUNDS,
                ),
            },
        );

        if (status === 'email_taken') {
            return { errorCode: 'EMAIL_TAKEN' };
        }

        if (status !== 'updated') {
            return { errorCode: 'UPDATE_FAILED' };
        }
    } catch (error) {
        console.error('Set password failed:', error);
        return { errorCode: 'UPDATE_FAILED' };
    }

    revalidatePath(`/${locale}/profile`);

    return { success: true };
}
