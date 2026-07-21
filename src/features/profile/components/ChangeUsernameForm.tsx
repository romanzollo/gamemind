'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { changeUsernameAction } from '@/features/profile/actions';
import { getProfileErrorMessage } from '@/features/profile/lib/get-profile-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

type ChangeUsernameFormProps = {
    locale: Locale;
    dictionary: Dictionary;
    currentUsername: string;
};

const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const labelClassName = 'text-sm font-medium text-foreground sm:text-base';

export function ChangeUsernameForm({
    locale,
    dictionary,
    currentUsername,
}: ChangeUsernameFormProps) {
    const router = useRouter();
    const [state, formAction] = useActionState(changeUsernameAction, {});
    const errorMessage = getProfileErrorMessage(dictionary, state.errorCode);

    // unstable_update пишет cookie, но soft revalidate после action
    // часто ещё видит старую сессию — нужен client refresh.
    // Зависим от state.username: success остаётся true при 2-й смене,
    // и эффект иначе не перезапустится.
    useEffect(() => {
        if (state.success && state.username) {
            router.refresh();
        }
    }, [state.success, state.username, router]);

    return (
        <div className="mt-6">
            <h3 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                {dictionary.profile.changeUsernameTitle}
            </h3>

            <form
                key={currentUsername}
                action={formAction}
                className="mt-3 space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
            >
                <input type="hidden" name="locale" value={locale} />

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {dictionary.profile.newUsername}
                    </span>
                    <input
                        name="username"
                        type="text"
                        autoComplete="username"
                        required
                        minLength={3}
                        maxLength={20}
                        pattern="[a-zA-Z0-9_]+"
                        defaultValue={currentUsername}
                        className={fieldClassName}
                    />
                </label>

                <SubmitButton
                    pendingLabel={dictionary.common.submitting}
                    className="w-full sm:w-auto"
                >
                    {dictionary.profile.changeUsernameSubmit}
                </SubmitButton>
            </form>

            {errorMessage ? (
                <InlineAlert className="mt-2">{errorMessage}</InlineAlert>
            ) : null}

            {state.success ? (
                <InlineAlert
                    className="mt-2"
                    tone="success"
                    role="status"
                >
                    {dictionary.profile.changeUsernameSuccess}
                </InlineAlert>
            ) : null}
        </div>
    );
}
