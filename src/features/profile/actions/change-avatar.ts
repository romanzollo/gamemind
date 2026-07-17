'use server';

import { revalidatePath } from 'next/cache';

import { userRepository } from '@/entities/user/user.repository';
import { changeAvatarSchema } from '@/features/profile/lib/validation';
import type { ProfileFormState } from '@/features/profile/types';
import { unstable_update } from '@/lib/auth';
import { requireUser } from '@/lib/auth/guards';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

/**
 * Получение локали из формы
 */
function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

/**
 * Смена аватара
 */
export async function changeAvatarAction(
    _prevState: ProfileFormState,
    formData: FormData,
): Promise<ProfileFormState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireUser(locale);

    // Парсинг данных из формы
    const parsed = changeAvatarSchema.safeParse({
        imageUrl: formData.get('imageUrl'),
    });

    if (!parsed.success) {
        return { errorCode: 'INVALID_INPUT' };
    }

    // Получение URL аватара из данных
    const { imageUrl } = parsed.data;

    // В JWT/session пустой аватар часто null; в форме сброс = ''
    const nextImage = imageUrl === '' ? null : imageUrl;
    const currentImage = session.user.image ?? null;

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
        // image в JWT заработает после правки auth.config
        await unstable_update({ user: { image: nextImage } });
    } catch (error) {
        console.error('Session avatar update failed:', error);
        // БД уже обновлена; полный reload всё равно покажет актуальное после JWT-правки
    }

    revalidatePath(`/${locale}/profile`);
    revalidatePath(`/${locale}`, 'layout');

    // Возвращаем строку ('' при сбросе), чтобы useEffect зависел от значения
    return { success: true, imageUrl };
}
