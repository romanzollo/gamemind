import type { AdminErrorCode } from '../types';
import type { Dictionary } from '@/shared/i18n';

// карта ошибок для админ-панели
const ERROR_MAP: Record<AdminErrorCode, keyof Dictionary['admin']['errors']> = {
    INVALID_INPUT: 'invalidInput',
    NOT_FOUND: 'notFound',
    EXACTLY_ONE_CORRECT_REQUIRED: 'exactlyOneCorrectRequired',
    SAVE_FAILED: 'saveFailed',
    UPLOAD_FAILED: 'uploadFailed',
    INVALID_IMAGE: 'invalidImage',
    DELETE_FAILED: 'deleteFailed',
    DEACTIVATE_FAILED: 'deactivateFailed',
    ACTIVATE_FAILED: 'activateFailed',
    PUBLISH_FAILED: 'publishFailed',
    SUBMIT_FOR_REVIEW_FAILED: 'submitForReviewFailed',
    RETURN_TO_DRAFT_FAILED: 'returnToDraftFailed',
    INVALID_PUBLICATION_TRANSITION: 'invalidPublicationTransition',
    PUBLISH_QUALITY_BLOCKED: 'publishQualityBlocked',
    CANNOT_MODIFY_SELF: 'cannotModifySelf',
    CANNOT_DELETE_LAST_ADMIN: 'cannotDeleteLastAdmin',
    USER_UPDATE_FAILED: 'userUpdateFailed',
    USER_ROLE_UPDATE_FAILED: 'userRoleUpdateFailed',
    USER_DEACTIVATE_FAILED: 'userDeactivateFailed',
    USER_ACTIVATE_FAILED: 'userActivateFailed',
    RATE_LIMITED: 'rateLimited',
};

// функция для получения сообщения об ошибке для админ-панели
export function getAdminErrorMessage(
    dictionary: Dictionary,
    errorCode?: AdminErrorCode,
): string | undefined {
    if (!errorCode) return undefined;

    const key = ERROR_MAP[errorCode];
    return dictionary.admin.errors[key];
}
