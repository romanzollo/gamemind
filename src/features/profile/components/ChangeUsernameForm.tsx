'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { changeUsernameAction } from '@/features/profile/actions';
import { getProfileErrorMessage } from '@/features/profile/lib/get-profile-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';

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
        <section className="mt-10">
            <h2 className="text-xl font-semibold">
                {dictionary.profile.changeUsernameTitle}
            </h2>

            <form
                key={currentUsername}
                action={formAction}
                className="mt-4 space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
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

                <button
                    type="submit"
                    className="min-h-11 w-full rounded-md bg-primary px-4 py-2 text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
                >
                    {dictionary.profile.changeUsernameSubmit}
                </button>
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
                    {dictionary.profile.changeUsernameSuccess}
                </p>
            )}
        </section>
    );
}
