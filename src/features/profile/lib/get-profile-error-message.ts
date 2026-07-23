import type { ProfileErrorCode } from '../types';
import type { Dictionary } from '@/shared/i18n';

/**
 * Маппинг ошибок на сообщения
 */
const ERROR_MAP: Record<
    ProfileErrorCode,
    keyof Dictionary['profile']['errors']
> = {
    INVALID_INPUT: 'invalidInput',
    WRONG_CURRENT_PASSWORD: 'wrongCurrentPassword',
    SAME_PASSWORD: 'samePassword',
    USERNAME_TAKEN: 'usernameTaken',
    SAME_USERNAME: 'sameUsername',
    SAME_AVATAR: 'sameAvatar',
    UPLOAD_FAILED: 'uploadFailed',
    INVALID_IMAGE: 'invalidImage',
    UPDATE_FAILED: 'updateFailed',
};

/**
 * Получение сообщения об ошибке
 */
export function getProfileErrorMessage(
    dictionary: Dictionary,
    errorCode?: ProfileErrorCode,
): string | undefined {
    if (!errorCode) return undefined;

    return dictionary.profile.errors[ERROR_MAP[errorCode]];
}
