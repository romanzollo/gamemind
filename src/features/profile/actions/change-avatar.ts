'use server';

import { revalidatePath } from 'next/cache';

import { userRepository } from '@/entities/user/user.repository';
import { resolveAvatarImage } from '@/features/profile/lib/resolve-avatar-image';
import type { ProfileFormState } from '@/features/profile/types';
import { unstable_update } from '@/lib/auth';
import { requireUser } from '@/lib/auth/guards';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

/**
 * Смена аватара (Phase B): file upload → `/media/avatars/...`,
 * URL-поле остаётся advanced; пустой imageUrl = сброс.
 *
 * После записи в БД: unstable_update JWT + client router.refresh().
 */
export async function changeAvatarAction(
    _prevState: ProfileFormState,
    formData: FormData,
): Promise<ProfileFormState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireUser(locale);

    const previousPublicUrl = session.user.image ?? null;

    const resolved = await resolveAvatarImage({
        formData,
        userId: session.user.id,
        previousPublicUrl,
    });

    if (!resolved.ok) {
        return { errorCode: resolved.errorCode };
    }

    const { imageUrl } = resolved;
    const nextImage = imageUrl === '' ? null : imageUrl;
    const currentImage = previousPublicUrl;

    if (currentImage === nextImage) {
        return { errorCode: 'SAME_AVATAR' };
    }

    try {
        const status = await userRepository.updateImage(
            session.user.id,
            imageUrl,
        );

        if (status === 'unchanged') {
            return { errorCode: 'SAME_AVATAR' };
        }

        if (status === 'not_found') {
            return { errorCode: 'UPDATE_FAILED' };
        }
    } catch (error) {
        console.error('Change avatar failed:', error);
        return { errorCode: 'UPDATE_FAILED' };
    }

    try {
        await unstable_update({ user: { image: nextImage } });
    } catch (error) {
        console.error('Session avatar update failed:', error);
        // БД уже обновлена; refresh всё равно подтянет актуальное после JWT
    }

    revalidatePath(`/${locale}/profile`);
    revalidatePath(`/${locale}`, 'layout');

    return { success: true, imageUrl };
}
