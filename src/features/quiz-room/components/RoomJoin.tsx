'use client';

/**
 * Вход в комнату по ссылке (экран 2 макета).
 * - RoomGuestGate — посетитель без сессии: «Играть без регистрации» (гость,
 *   возврат сюда же через `next`) или вход в свой аккаунт.
 * - RoomJoinForm — вошедший, но ещё не в комнате: имя в игре и «Войти в
 *   комнату». Гостю имя придумывается само (кнопка ⟳ — другое).
 * Проверки имени и мест — на сервере (`joinRoomAction`).
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { guestSignInAction } from '@/features/auth/actions';
import { getAuthErrorMessage } from '@/features/auth/lib/get-auth-error-message';
import { joinRoomAction } from '@/features/quiz-room/actions/room-actions';
import { roomErrorMessage } from '@/features/quiz-room/lib/room-labels';
import {
    generateRoomNickname,
    ROOM_NICKNAME_MAX_LENGTH,
    ROOM_NICKNAME_MIN_LENGTH,
} from '@/features/quiz-room/lib/room-nickname';
import { getDictionary, type Locale } from '@/shared/i18n';
import { buttonClassName, InlineAlert, SubmitButton } from '@/shared/ui';

export function RoomGuestGate({ locale, code }: { locale: Locale; code: string }) {
    const dictionary = getDictionary(locale);
    const [state, formAction] = useActionState(guestSignInAction, {});
    const errorMessage = getAuthErrorMessage(dictionary, state.errorCode);
    const next = `/${locale}/room/${code}`;

    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">{dictionary.room.guestHint}</p>
            <form action={formAction} className="flex flex-col">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="next" value={next} />
                <SubmitButton
                    pendingLabel={dictionary.common.working}
                    className="w-full"
                    data-testid="room-guest"
                >
                    {dictionary.auth.guestButton}
                </SubmitButton>
            </form>
            <Link
                href={`/${locale}/login?next=${encodeURIComponent(next)}`}
                className={buttonClassName({ variant: 'secondary', className: 'w-full' })}
            >
                {dictionary.room.signIn}
            </Link>
            {errorMessage ? <InlineAlert>{errorMessage}</InlineAlert> : null}
        </div>
    );
}

type RoomJoinFormProps = {
    locale: Locale;
    code: string;
    /**
     * Стартовое имя: у аккаунта — username, у гостя — придуманное на
     * сервере (случайное имя в рендере клиента разошлось бы с SSR).
     */
    defaultNickname: string;
};

export function RoomJoinForm({ locale, code, defaultNickname }: RoomJoinFormProps) {
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const [state, formAction] = useActionState(joinRoomAction, {});
    const [nickname, setNickname] = useState(defaultNickname);
    const errorMessage = roomErrorMessage(dictionary, state.errorCode);

    return (
        <form action={formAction} className="flex flex-col">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="code" value={code} />
            <label htmlFor="room-nickname" className="text-sm font-medium text-foreground">
                {text.nicknameLabel}
            </label>
            <div className="mt-2 flex gap-2">
                <input
                    id="room-nickname"
                    name="nickname"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    required
                    minLength={ROOM_NICKNAME_MIN_LENGTH}
                    maxLength={ROOM_NICKNAME_MAX_LENGTH}
                    autoComplete="nickname"
                    aria-describedby="room-nickname-hint"
                    className="min-h-11 w-full min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-base font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    data-testid="room-nickname"
                />
                <button
                    type="button"
                    onClick={() => setNickname(generateRoomNickname(text.nicknameWords))}
                    aria-label={text.nicknameReroll}
                    title={text.nicknameReroll}
                    className={buttonClassName({ variant: 'secondary', className: 'w-11 shrink-0 px-0' })}
                >
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                        <path d="M20 4v4h-4" />
                    </svg>
                </button>
            </div>
            <p id="room-nickname-hint" className="mt-1.5 text-xs text-muted">
                {text.nicknameHint}
            </p>
            <SubmitButton
                pendingLabel={dictionary.common.working}
                className="mt-4 w-full"
                data-testid="room-join"
            >
                {text.enter}
            </SubmitButton>
            {errorMessage ? <InlineAlert className="mt-3">{errorMessage}</InlineAlert> : null}
        </form>
    );
}
