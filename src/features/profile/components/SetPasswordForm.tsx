'use client';

import { useActionState, useEffect } from 'react';

import { setPasswordAction } from '@/features/profile/actions/set-password';
import { getProfileErrorMessage } from '@/features/profile/lib/get-profile-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton, toastSuccess } from '@/shared/ui';

type SetPasswordFormProps = {
    locale: Locale;
    dictionary: Dictionary;
    /** У аккаунта нет почты (VK ID без email) — без неё пароль бесполезен. */
    emailRequired: boolean;
};

const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const labelClassName = 'text-sm font-medium text-foreground sm:text-base';

/**
 * Первый пароль для аккаунта из Яндекса / VK ID — только presentation;
 * логика в setPasswordAction. После успеха страница пересоберётся
 * (revalidate) и на месте этой формы окажется ChangePasswordForm.
 */
export function SetPasswordForm({
    locale,
    dictionary,
    emailRequired,
}: SetPasswordFormProps) {
    const [state, formAction] = useActionState(setPasswordAction, {});
    const errorMessage = getProfileErrorMessage(dictionary, state.errorCode);

    useEffect(() => {
        if (state.success) {
            toastSuccess(dictionary.profile.setPasswordSuccess);
        }
    }, [state.success, dictionary.profile.setPasswordSuccess]);

    return (
        <div className="mt-4">
            <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                {dictionary.profile.changePasswordTitle}
            </h3>
            <p className="mt-1 text-sm text-muted">
                {dictionary.profile.setPasswordHint}
            </p>

            <form
                action={formAction}
                className="mt-3 space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
            >
                <input type="hidden" name="locale" value={locale} />

                {emailRequired ? (
                    <label className="flex flex-col gap-2">
                        <span className={labelClassName}>
                            {dictionary.profile.email}
                        </span>
                        <input
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            className={fieldClassName}
                        />
                    </label>
                ) : null}

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {dictionary.profile.newPassword}
                    </span>
                    <input
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={72}
                        className={fieldClassName}
                    />
                </label>

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {dictionary.profile.confirmNewPassword}
                    </span>
                    <input
                        name="confirmNewPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        maxLength={72}
                        className={fieldClassName}
                    />
                </label>

                <SubmitButton
                    pendingLabel={dictionary.common.submitting}
                    className="w-full sm:w-auto"
                >
                    {dictionary.profile.setPasswordSubmit}
                </SubmitButton>
            </form>

            {errorMessage ? (
                <InlineAlert className="mt-2">{errorMessage}</InlineAlert>
            ) : null}
        </div>
    );
}
