export type AuthErrorCode =
    | 'INVALID_INPUT'
    | 'EMAIL_TAKEN'
    | 'USERNAME_TAKEN'
    | 'CREATE_FAILED'
    | 'AUTO_LOGIN_FAILED'
    | 'INVALID_CREDENTIALS'
    | 'LOGIN_FAILED';

export type AuthFormState = {
    errorCode?: AuthErrorCode;
    success?: boolean;
};
