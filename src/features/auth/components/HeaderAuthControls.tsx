'use client';

import { usePathname } from 'next/navigation';

import { logoutAction } from '@/features/auth/actions';
import type { Dictionary, Locale } from '@/shared/i18n';
import {
    buttonClassName,
    PendingLink,
    SubmitButton,
    UserAvatar,
} from '@/shared/ui';
import { isNavActive, navActiveClassName } from '@/shared/ui/nav-active';

type NavUser = {
    username: string;
    image?: string | null;
};

type HeaderAuthControlsProps = {
    locale: Locale;
    dictionary: Dictionary;
    user: NavUser | null;
};

function localizedHref(locale: Locale, href: string) {
    return href === '/' ? `/${locale}` : `/${locale}${href}`;
}

const linkClassName =
    'rounded-md px-2 py-1 text-sm text-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const profileLinkClassName =
    'inline-flex items-center rounded-md px-1 py-0.5 transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Правый край шапки.
 *
 * Игрок: аватар и «Выйти» — только с `lg`. На телефоне профиль — вкладка
 * нижней панели, а «Выйти» есть на странице профиля.
 * Посетитель: «Войти» на любой ширине, «Регистрация» — с `lg`
 * (на телефоне она и «Играть без регистрации» — на странице входа).
 */
export function HeaderAuthControls({
    locale,
    dictionary,
    user,
}: HeaderAuthControlsProps) {
    const pathname = usePathname();
    const loginActive = isNavActive(pathname, '/login');
    const registerActive = isNavActive(pathname, '/register');
    const profileActive = isNavActive(pathname, '/profile');

    if (user) {
        return (
            <div className="hidden items-center gap-2 lg:flex">
                <PendingLink
                    href={localizedHref(locale, '/profile')}
                    className={navActiveClassName(
                        profileActive,
                        profileLinkClassName,
                    )}
                    aria-current={profileActive ? 'page' : undefined}
                    title={user.username}
                >
                    {/* PendingLink оборачивает детей в строчный span: без своей
                        flex-строки аватар (блок) выталкивал ник на новую строку. */}
                    <span className="flex items-center gap-2">
                        <UserAvatar
                            src={user.image}
                            size="sm"
                            alt={user.username}
                        />
                        <span className="hidden max-w-28 truncate text-sm text-muted xl:inline">
                            {user.username}
                        </span>
                    </span>
                </PendingLink>
                <form action={logoutAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <SubmitButton
                        variant="secondary"
                        pendingLabel={dictionary.common.working}
                        className="min-h-9 px-3 py-1.5"
                    >
                        {dictionary.nav.logout}
                    </SubmitButton>
                </form>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <PendingLink
                href={localizedHref(locale, '/login')}
                className={navActiveClassName(loginActive, linkClassName)}
                aria-current={loginActive ? 'page' : undefined}
            >
                {dictionary.nav.login}
            </PendingLink>
            <div className="hidden lg:block">
                <PendingLink
                    href={localizedHref(locale, '/register')}
                    className={buttonClassName({
                        className: navActiveClassName(
                            registerActive,
                            'min-h-9 px-3 py-1.5',
                        ),
                    })}
                    aria-current={registerActive ? 'page' : undefined}
                >
                    {dictionary.nav.register}
                </PendingLink>
            </div>
        </div>
    );
}
