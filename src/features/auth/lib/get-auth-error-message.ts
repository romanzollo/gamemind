import type { AuthErrorCode } from '@/features/auth/types';
import type { Dictionary } from '@/shared/i18n';

const ERROR_MAP: Record<AuthErrorCode, keyof Dictionary['auth']['errors']> = {
    INVALID_INPUT: 'invalidInput',
    EMAIL_TAKEN: 'emailTaken',
    USERNAME_TAKEN: 'usernameTaken',
    CREATE_FAILED: 'createFailed',
    AUTO_LOGIN_FAILED: 'autoLoginFailed',
    INVALID_CREDENTIALS: 'invalidCredentials',
    LOGIN_FAILED: 'loginFailed',
    RATE_LIMITED: 'rateLimited',
};

/** Auth actions возвращают стабильные коды, UI выбирает текст по текущей локали. */
export function getAuthErrorMessage(
    dictionary: Dictionary,
    errorCode?: AuthErrorCode,
): string | undefined {
    if (!errorCode) return undefined;

    return dictionary.auth.errors[ERROR_MAP[errorCode]];
}
