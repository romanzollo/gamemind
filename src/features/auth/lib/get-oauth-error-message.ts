import type { Dictionary } from '@/shared/i18n';

/**
 * Текст ошибки внешнего входа по `?error=` от Auth.js (`pages.error` —
 * страница входа). Коды Auth.js: `OAuthAccountNotLinked`, `AccessDenied`
 * (наш `signIn` callback отказал — аккаунт отключён); всё остальное
 * (отмена у провайдера, `Configuration`) — общий текст с выходом.
 */
export function getOAuthErrorMessage(
    dictionary: Dictionary,
    error: string | string[] | undefined,
): string | undefined {
    if (typeof error !== 'string' || error === '') return undefined;

    const { errors } = dictionary.auth;

    switch (error) {
        case 'OAuthAccountNotLinked':
            return errors.oauthAccountNotLinked;
        case 'AccessDenied':
            return errors.oauthAccessDenied;
        default:
            return errors.oauthFailed;
    }
}
