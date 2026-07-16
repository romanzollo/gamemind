export type ProfileErrorCode =
    | 'INVALID_INPUT'
    | 'WRONG_CURRENT_PASSWORD'
    | 'SAME_PASSWORD'
    | 'USERNAME_TAKEN'
    | 'SAME_USERNAME'
    | 'UPDATE_FAILED';

export type ProfileFormState = {
    errorCode?: ProfileErrorCode;
    success?: boolean;
    /** Present after successful username change; changes each update so UI can refresh. */
    username?: string;
};
