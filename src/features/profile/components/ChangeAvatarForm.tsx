'use client';

import { startTransition, useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { changeAvatarAction } from '@/features/profile/actions';
import { getProfileErrorMessage } from '@/features/profile/lib/get-profile-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import { Button, InlineAlert, SubmitButton, UserAvatar } from '@/shared/ui';

type ChangeAvatarFormProps = {
    locale: Locale;
    dictionary: Dictionary;
    /** Текущий URL из сессии/БД; null = аватара нет */
    currentImageUrl: string | null;
};

const fieldClassName =
    'min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

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
        <div className="mt-4">
            {currentImageUrl ? (
                <div className="mb-4">
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
                className="space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
            >
                <input type="hidden" name="locale" value={locale} />

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {dictionary.profile.avatarFile}
                    </span>
                    <input
                        name="avatarFile"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className={fieldClassName}
                    />
                    <span className="text-sm text-muted">
                        {dictionary.profile.avatarFileHint}
                    </span>
                </label>

                <label className="flex flex-col gap-2">
                    <span className={labelClassName}>
                        {dictionary.profile.avatarUrl}
                    </span>
                    <input
                        name="imageUrl"
                        type="text"
                        inputMode="url"
                        maxLength={2048}
                        defaultValue=""
                        placeholder="/media/avatars/… or https://…"
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
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={isPending}
                            aria-busy={isPending}
                            className="w-full sm:w-auto"
                            onClick={() => {
                                const fd = new FormData();
                                fd.set('locale', locale);
                                fd.set('clearAvatar', '1');
                                startTransition(() => {
                                    formAction(fd);
                                });
                            }}
                        >
                            {isPending
                                ? dictionary.common.working
                                : dictionary.profile.clearAvatar}
                        </Button>
                    ) : null}
                </div>
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
                    {dictionary.profile.changeAvatarSuccess}
                </InlineAlert>
            ) : null}
        </div>
    );
}
