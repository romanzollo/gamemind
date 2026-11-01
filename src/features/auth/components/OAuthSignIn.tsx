import { oauthSignInAction } from '@/features/auth/actions';
import { isYandexSignInEnabled } from '@/lib/auth/providers';
import { getDictionary, type Locale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';

/**
 * Блок «или — Войти с Яндекс ID» под формой входа / регистрации.
 * Server Component: включён ли провайдер, знает только сервер (env).
 * Без ключей Яндекса блока нет совсем.
 */
export function OAuthSignIn({ locale }: { locale: Locale }) {
    if (!isYandexSignInEnabled) {
        return null;
    }

    const dictionary = getDictionary(locale);

    return (
        <div className="mt-6 flex flex-col gap-3">
            <div className="flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <span>{dictionary.auth.oauthDivider}</span>
                <span className="h-px flex-1 bg-border" aria-hidden />
            </div>
            <form action={oauthSignInAction} className="flex flex-col">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="provider" value="yandex" />
                <SubmitButton
                    variant="secondary"
                    pendingLabel={dictionary.auth.yandexButton}
                >
                    {dictionary.auth.yandexButton}
                </SubmitButton>
            </form>
        </div>
    );
}
