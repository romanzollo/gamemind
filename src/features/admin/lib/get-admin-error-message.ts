import type { AdminErrorCode } from '../types';
import type { Dictionary } from '@/shared/i18n';

// карта ошибок для админ-панели
const ERROR_MAP: Record<AdminErrorCode, keyof Dictionary['admin']['errors']> = {
    INVALID_INPUT: 'invalidInput',
    NOT_FOUND: 'notFound',
    EXACTLY_ONE_CORRECT_REQUIRED: 'exactlyOneCorrectRequired',
    SAVE_FAILED: 'saveFailed',
    DELETE_FAILED: 'deleteFailed',
    DEACTIVATE_FAILED: 'deactivateFailed',
    ACTIVATE_FAILED: 'activateFailed',
};

// функция для получения сообщения об ошибке для админ-панели
export function getAdminErrorMessage(
    dictionary: Dictionary,
    errorCode?: AdminErrorCode,
): string | undefined {
    // если ошибка не передана, возвращаем undefined
    if (!errorCode) return undefined;

    // получаем ключ ошибки из карты ошибок
    const key = ERROR_MAP[errorCode];
    // возвращаем сообщение об ошибке из словаря
    return dictionary.admin.errors[key];
}
