export type ProfileErrorCode =
    | 'INVALID_INPUT'
    | 'WRONG_CURRENT_PASSWORD'
    | 'SAME_PASSWORD'
    | 'UPDATE_FAILED';

export type ProfileFormState = {
    errorCode?: ProfileErrorCode;
    success?: boolean;
};
