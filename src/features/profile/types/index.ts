export type ProfileErrorCode =
    | 'INVALID_INPUT'
    | 'WRONG_CURRENT_PASSWORD'
    | 'SAME_PASSWORD'
    | 'USERNAME_TAKEN'
    | 'SAME_USERNAME'
    | 'SAME_AVATAR'
    | 'UPDATE_FAILED';

export type ProfileFormState = {
    errorCode?: ProfileErrorCode;
    success?: boolean;
    /** После успешной смены username — меняется каждый раз, чтобы UI сделал refresh. */
    username?: string;
    /**
     * После успешной смены аватара — URL или '' при сбросе.
     * Нужен, чтобы useEffect зависел от значения, а не только от success.
     */
    imageUrl?: string;
};
