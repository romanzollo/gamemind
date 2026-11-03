'use client';

import { useActionState } from 'react';

import { guestSignInAction } from '@/features/auth/actions';
import { getAuthErrorMessage } from '@/features/auth/lib/get-auth-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import {
    InlineAlert,
    PendingLink,
    SubmitButton,
    buttonClassName,
} from '@/shared/ui';

type GuestSignInFormProps = {
    locale: Locale;
    dictionary: Dictionary;
    /** Подпись кнопки; по умолчанию «Играть без регистрации». */
    label?: string;
    className?: string;
};

/**
 * Одна кнопка гостевого входа (3.4): гость создаётся на сервере
 * (guestSignInAction, лимит с IP) и попадает на главную.
 * Подпись меняется по месту: в карточке Челленджа для посетителя — «Принять
 * вызов», потому что «Играть без регистрации» уже есть во вступлении.
 */
export function GuestSignInForm({
    locale,
    dictionary,
    label = dictionary.auth.guestButton,
    className = '',
}: GuestSignInFormProps) {
    const [state, formAction] = useActionState(guestSignInAction, {});
    const errorMessage = getAuthErrorMessage(dictionary, state.errorCode);

    return (
        <div className={`flex w-full flex-col gap-2 ${className}`.trim()}>
            <form action={formAction} className="flex flex-col">
                <input type="hidden" name="locale" value={locale} />
                <SubmitButton pendingLabel={dictionary.common.working}>
                    {label}
                </SubmitButton>
            </form>

            {errorMessage ? <InlineAlert>{errorMessage}</InlineAlert> : null}
        </div>
    );
}

type GuestPlayPromptProps = {
    locale: Locale;
    dictionary: Dictionary;
};

/**
 * Посетитель без сессии там, где режим открыт гостям (шторка Классики):
 * «Играть без регистрации» в одно касание + «Войти».
 * Блиц и Выживание гостям закрыты — у них своё приглашение войти.
 */
export function GuestPlayPrompt({ locale, dictionary }: GuestPlayPromptProps) {
    return (
        <div className="flex w-full flex-col gap-2">
            <GuestSignInForm locale={locale} dictionary={dictionary} />
            <p className="text-sm text-muted">{dictionary.auth.guestHint}</p>
            <PendingLink
                href={`/${locale}/login`}
                className={buttonClassName({ variant: 'secondary' })}
            >
                {dictionary.nav.login}
            </PendingLink>
        </div>
    );
}
