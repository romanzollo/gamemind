'use server';

import { revalidatePath } from 'next/cache';

import { userRepository } from '@/entities/user/user.repository';
import { changeUsernameSchema } from '@/features/profile/lib/validation';
import type { ProfileFormState } from '@/features/profile/types';
import { requireUser } from '@/lib/auth/guards';
import { unstable_update } from '@/lib/auth';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

export async function changeUsernameAction(
    _prevState: ProfileFormState,
    formData: FormData,
): Promise<ProfileFormState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireUser(locale);

    const parsed = changeUsernameSchema.safeParse({
        username: formData.get('username'),
    });

    if (!parsed.success) {
        return { errorCode: 'INVALID_INPUT' };
    }

    const { username } = parsed.data;

    if (username === session.user.username) {
        return { errorCode: 'SAME_USERNAME' };
    }

    try {
        const status = await userRepository.updateUsername(
            session.user.id,
            username,
        );

        if (status === 'taken') {
            return { errorCode: 'USERNAME_TAKEN' };
        }

        if (status === 'unchanged') {
            return { errorCode: 'SAME_USERNAME' };
        }

        if (status === 'not_found') {
            return { errorCode: 'UPDATE_FAILED' };
        }
    } catch (error) {
        console.error('Change username failed:', error);
        return { errorCode: 'UPDATE_FAILED' };
    }

    try {
        await unstable_update({ user: { username } });
    } catch (error) {
        console.error('Session username update failed:', error);
        // DB already updated; profile revalidate still helps on next full reload.
    }

    revalidatePath(`/${locale}/profile`);
    revalidatePath(`/${locale}`, 'layout');

    return { success: true, username };
}
