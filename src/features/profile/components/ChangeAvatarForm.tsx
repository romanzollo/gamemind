'use client';

import { startTransition, useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { changeAvatarAction } from '@/features/profile/actions';
import { getProfileErrorMessage } from '@/features/profile/lib/get-profile-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import { SubmitButton, UserAvatar } from '@/shared/ui';

type ChangeAvatarFormProps = {
    locale: Locale;
    dictionary: Dictionary;
    /** Текущий URL из сессии/БД; null = аватара нет */
    currentImageUrl: string | null;
};

const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const labelClassName = 'text-sm font-medium text-foreground sm:text-base';

export function ChangeAvatarForm({
    locale,
    dictionary,
    currentImageUrl,
}: ChangeAvatarFormProps) {
    const router = useRouter();
    const [state, formAction, isPending] = useActionState(
        changeAvatarAction,
        {},
    );
    const errorMessage = getProfileErrorMessage(dictionary, state.errorCode);

    // Как у username: refresh после cookie update.
    // Важно: imageUrl может быть '' (сброс) — проверяем !== undefined, не truthy.
    useEffect(() => {
        if (state.success && state.imageUrl !== undefined) {
            router.refresh();
        }
    }, [state.success, state.imageUrl, router]);

    return (
        <section className="mt-10">
            <h2 className="text-xl font-semibold">
                {dictionary.profile.changeAvatarTitle}
            </h2>

            {currentImageUrl ? (
                <div className="mt-4">
                    <UserAvatar
                        src={currentImageUrl}
                        size="md"
                        alt={dictionary.profile.changeAvatarTitle}
                    />
                </div>
            ) : null}

            <form
                key={currentImageUrl ?? ''}
                action={formAction}
                className="mt-4 space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
            >
                <input type="hidden" name="locale" value={locale} />

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {dictionary.profile.avatarUrl}
                    </span>
                    <input
                        name="imageUrl"
                        type="text"
                        inputMode="url"
                        maxLength={2048}
                        defaultValue={currentImageUrl ?? ''}
                        placeholder="https://…/photo.webp"
                        className={fieldClassName}
                    />
                    <span className="text-sm text-muted">
                        {dictionary.profile.avatarUrlHint}
                    </span>
                </label>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <SubmitButton
                        pendingLabel={dictionary.common.submitting}
                        disabled={isPending}
                        className="w-full sm:w-auto"
                    >
                        {dictionary.profile.changeAvatarSubmit}
                    </SubmitButton>

                    {currentImageUrl ? (
                        <button
                            type="button"
                            disabled={isPending}
                            aria-busy={isPending}
                            onClick={() => {
                                const fd = new FormData();
                                fd.set('locale', locale);
                                fd.set('imageUrl', '');
                                startTransition(() => {
                                    formAction(fd);
                                });
                            }}
                            className="min-h-11 w-full rounded-md border border-border px-4 py-2 text-foreground transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-70 sm:w-auto"
                        >
                            {isPending
                                ? dictionary.common.working
                                : dictionary.profile.clearAvatar}
                        </button>
                    ) : null}
                </div>
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
                    {dictionary.profile.changeAvatarSuccess}
                </p>
            )}
        </section>
    );
}
