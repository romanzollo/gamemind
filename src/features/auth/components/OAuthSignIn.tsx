import { oauthSignInAction } from '@/features/auth/actions';
import { isYandexSignInEnabled } from '@/lib/auth/providers';
import { isVkIdSignInEnabled, VK_ID_PROVIDER_ID } from '@/lib/auth/vk-id';
import { getDictionary, type Locale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';

type OAuthButton = {
    provider: string;
    label: string;
};

/**
 * Блок «или — Войти с Яндекс ID / VK ID» под формой входа / регистрации.
 * Server Component: включён ли провайдер, знает только сервер (env).
 * Без ключей ни одного провайдера блока нет совсем.
 */
export function OAuthSignIn({
    locale,
    next = null,
}: {
    locale: Locale;
    /** Проверенный путь возврата (страница вызова); null — в профиль. */
    next?: string | null;
}) {
    const dictionary = getDictionary(locale);
    const buttons: OAuthButton[] = [];

    if (isYandexSignInEnabled) {
        buttons.push({
            provider: 'yandex',
            label: dictionary.auth.yandexButton,
        });
    }

    if (isVkIdSignInEnabled) {
        buttons.push({
            provider: VK_ID_PROVIDER_ID,
            label: dictionary.auth.vkButton,
        });
    }

    if (buttons.length === 0) {
        return null;
    }

    return (
        <div className="mt-6 flex flex-col gap-3">
            <div className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span>{dictionary.auth.oauthDivider}</span>
                <span className="h-px flex-1 bg-border" aria-hidden />
            </div>
            {/* Своя форма на кнопку: «нажато» показывается только у неё. */}
            {buttons.map(({ provider, label }) => (
                <form
                    key={provider}
                    action={oauthSignInAction}
                    className="flex flex-col"
                >
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="provider" value={provider} />
                    {next ? <input type="hidden" name="next" value={next} /> : null}
                    <SubmitButton variant="secondary" pendingLabel={label}>
                        {label}
                    </SubmitButton>
                </form>
            ))}
        </div>
    );
}
