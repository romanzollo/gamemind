import type { SignInMethods } from '@/entities/user/user.repository';
import { oauthSignInAction } from '@/features/auth/actions';
import { isYandexSignInEnabled } from '@/lib/auth/providers';
import { isVkIdSignInEnabled, VK_ID_PROVIDER_ID } from '@/lib/auth/vk-id';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';

type SignInMethodsListProps = {
    locale: Locale;
    dictionary: Dictionary;
    methods: SignInMethods;
    /** Ошибка привязки входа (`?signInError=` от страницы входа). */
    errorMessage?: string;
};

type ProviderRow = {
    provider: string;
    /** Названия сервисов — одинаковые в RU и EN. */
    label: string;
    enabled: boolean;
};

const PROVIDERS: ProviderRow[] = [
    { provider: 'yandex', label: 'Яндекс ID', enabled: isYandexSignInEnabled },
    {
        provider: VK_ID_PROVIDER_ID,
        label: 'VK ID',
        enabled: isVkIdSignInEnabled,
    },
];

const rowClassName =
    'flex min-h-11 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0';

/**
 * «Способы входа»: пароль и внешние входы. «Подключить» — тот же
 * oauthSignInAction, что на странице входа: у вошедшего игрока Auth.js
 * привязывает новый вход к текущему аккаунту. Отключения нет намеренно —
 * так легко остаться без единого способа войти.
 * Server Component: включённые провайдеры знает только сервер (env).
 */
export function SignInMethodsList({
    locale,
    dictionary,
    methods,
    errorMessage,
}: SignInMethodsListProps) {
    const { profile } = dictionary;
    const providers = PROVIDERS.filter(
        ({ provider, enabled }) =>
            enabled || methods.providers.includes(provider),
    );

    return (
        <div>

            <ul>
                <li className={rowClassName}>
                    <span className="text-sm text-foreground sm:text-base">
                        {profile.signInMethodPassword}
                    </span>
                    <span className="text-sm text-muted">
                        {methods.hasPassword
                            ? profile.signInMethodConnected
                            : profile.signInMethodNotSet}
                    </span>
                </li>

                {providers.map(({ provider, label, enabled }) => (
                    <li key={provider} className={rowClassName}>
                        <span className="text-sm text-foreground sm:text-base">
                            {label}
                        </span>
                        {methods.providers.includes(provider) ? (
                            <span className="text-sm text-muted">
                                {profile.signInMethodConnected}
                            </span>
                        ) : enabled ? (
                            <form action={oauthSignInAction}>
                                <input
                                    type="hidden"
                                    name="locale"
                                    value={locale}
                                />
                                <input
                                    type="hidden"
                                    name="provider"
                                    value={provider}
                                />
                                <SubmitButton
                                    variant="secondary"
                                    pendingLabel={profile.signInMethodConnect}
                                    className="min-h-9 px-3 py-1.5"
                                >
                                    {profile.signInMethodConnect}
                                </SubmitButton>
                            </form>
                        ) : null}
                    </li>
                ))}
            </ul>

            {errorMessage ? (
                <InlineAlert className="mt-2">{errorMessage}</InlineAlert>
            ) : null}
        </div>
    );
}
