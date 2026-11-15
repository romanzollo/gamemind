'use client';

/**
 * Вход в комнату с главной (шторка «Комната») и со страницы `/room`:
 * «Создать комнату» (аккаунт) или код от ведущего. Код уходит обычной
 * GET-формой на `/room?code=…` — страница проверит его и откроет комнату.
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import Link from 'next/link';
import { useActionState } from 'react';

import { createRoomAction } from '@/features/quiz-room/actions/room-actions';
import { ROOM_CODE_LENGTH } from '@/features/quiz-room/lib/room-code';
import { roomErrorMessage } from '@/features/quiz-room/lib/room-labels';
import { getDictionary, type Locale } from '@/shared/i18n';
import { buttonClassName, InlineAlert, SubmitButton } from '@/shared/ui';

type RoomEntryProps = {
    locale: Locale;
    /** Аккаунт (не гость) — может создать комнату. */
    canCreate: boolean;
    /** Ошибка введённого кода (страница `/room?code=…`). */
    codeError?: string;
    initialCode?: string;
};

export function RoomEntry({ locale, canCreate, codeError, initialCode }: RoomEntryProps) {
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const [state, createAction] = useActionState(createRoomAction, {});
    const createError = roomErrorMessage(dictionary, state.errorCode);

    return (
        <div className="flex flex-col">
            {canCreate ? (
                <form action={createAction} className="flex flex-col">
                    <input type="hidden" name="locale" value={locale} />
                    <SubmitButton
                        pendingLabel={dictionary.common.working}
                        className="w-full"
                        data-testid="room-create"
                    >
                        {text.create}
                    </SubmitButton>
                    {createError ? <InlineAlert className="mt-3">{createError}</InlineAlert> : null}
                </form>
            ) : (
                <Link
                    href={`/${locale}/login?next=${encodeURIComponent(`/${locale}`)}`}
                    className={buttonClassName({ variant: 'secondary', className: 'w-full' })}
                >
                    {text.createNeedsAccount}
                </Link>
            )}

            <div className="my-4 flex items-center gap-3 text-xs text-muted" aria-hidden>
                <span className="h-px flex-1 bg-border" />
                {text.or}
                <span className="h-px flex-1 bg-border" />
            </div>

            <form action={`/${locale}/room`} method="get" className="flex flex-col">
                <label htmlFor="room-code" className="text-sm font-medium text-foreground">
                    {text.haveCode}
                </label>
                <div className="mt-2 flex gap-2">
                    <input
                        id="room-code"
                        name="code"
                        defaultValue={initialCode}
                        required
                        minLength={ROOM_CODE_LENGTH}
                        maxLength={ROOM_CODE_LENGTH + 2}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        inputMode="text"
                        placeholder="K7QF"
                        aria-label={text.codeLabel}
                        aria-invalid={codeError ? true : undefined}
                        className="min-h-12 w-full min-w-0 flex-1 rounded-md border border-border bg-surface px-4 text-center font-display text-2xl font-semibold uppercase tracking-[0.3em] text-foreground placeholder:text-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        data-testid="room-code-input"
                    />
                    <button
                        type="submit"
                        className={buttonClassName({ variant: 'secondary', className: 'min-h-12 shrink-0' })}
                        data-testid="room-code-join"
                    >
                        {text.join}
                    </button>
                </div>
                {codeError ? <InlineAlert className="mt-3">{codeError}</InlineAlert> : null}
            </form>
        </div>
    );
}
