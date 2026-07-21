'use client';

import { useActionState, useEffect, useRef } from 'react';

import { changePasswordAction } from '@/features/profile/actions';
import { getProfileErrorMessage } from '@/features/profile/lib/get-profile-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';

type ChangePasswordFormProps = {
    locale: Locale;
    dictionary: Dictionary;
};

// класс для полей формы
const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

// класс для лейблов формы
const labelClassName = 'text-sm font-medium text-foreground sm:text-base';

// компонент для изменения пароля пользователя
export function ChangePasswordForm({
    locale,
    dictionary,
}: ChangePasswordFormProps) {
    const [state, formAction] = useActionState(changePasswordAction, {});
    const formRef = useRef<HTMLFormElement>(null);
    const errorMessage = getProfileErrorMessage(dictionary, state.errorCode);

    useEffect(() => {
        if (state.success) {
            formRef.current?.reset();
        }
    }, [state.success]);

    return (
        <section className="mt-10">
            <h2 className="text-xl font-semibold">
                {dictionary.profile.changePasswordTitle}
            </h2>

            <form
                ref={formRef}
                action={formAction}
                className="mt-4 space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
            >
                <input type="hidden" name="locale" value={locale} />

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {dictionary.profile.currentPassword}
                    </span>
                    <input
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        required
                        className={fieldClassName}
                    />
                </label>

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
                    {dictionary.profile.changePasswordSubmit}
                </SubmitButton>
            </form>

            {errorMessage && (
                <p
                    className="mt-2 rounded-sm bg-danger-muted px-3 py-2 text-sm text-danger"
                    role="alert"
                >
                    {errorMessage}
                </p>
            )}

            {state.success && (
                <p
                    className="mt-2 rounded-sm bg-success-muted px-3 py-2 text-sm text-success"
                    role="status"
                >
                    {dictionary.profile.changePasswordSuccess}
                </p>
            )}
        </section>
    );
}
