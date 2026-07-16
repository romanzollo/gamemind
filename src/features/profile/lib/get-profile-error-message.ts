import type { ProfileErrorCode } from '../types';
import type { Dictionary } from '@/shared/i18n';

const ERROR_MAP: Record<
    ProfileErrorCode,
    keyof Dictionary['profile']['errors']
> = {
    INVALID_INPUT: 'invalidInput',
    WRONG_CURRENT_PASSWORD: 'wrongCurrentPassword',
    SAME_PASSWORD: 'samePassword',
    USERNAME_TAKEN: 'usernameTaken',
    SAME_USERNAME: 'sameUsername',
    UPDATE_FAILED: 'updateFailed',
};

export function getProfileErrorMessage(
    dictionary: Dictionary,
    errorCode?: ProfileErrorCode,
): string | undefined {
    if (!errorCode) return undefined;

    return dictionary.profile.errors[ERROR_MAP[errorCode]];
}
