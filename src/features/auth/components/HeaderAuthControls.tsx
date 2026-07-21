'use client';

import type { Role } from '@prisma/client';
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
    role: Role;
    image?: string | null;
};

type HeaderAuthControlsProps = {
    locale: Locale;
    dictionary: Dictionary;
    user: NavUser | null;
    /**
     * `bar` — compact chrome (desktop full / mobile avatar-only).
     * `menu` — stacked controls for the mobile slide-down panel (no avatar —
     * avatar already sits in the header bar; Profile is in the nav list).
     */
    variant?: 'bar' | 'menu';
};

function localizedHref(locale: Locale, href: string) {
    return href === '/' ? `/${locale}` : `/${locale}${href}`;
}

const linkClassName =
    'rounded-md px-2 py-1 text-sm text-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const profileLinkClassName =
    'inline-flex items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function HeaderAuthControls({
    locale,
    dictionary,
    user,
    variant = 'bar',
}: HeaderAuthControlsProps) {
    const pathname = usePathname();
    const loginActive = isNavActive(pathname, '/login');
    const registerActive = isNavActive(pathname, '/register');
    const profileActive = isNavActive(pathname, '/profile');

    if (variant === 'menu') {
        if (user) {
            return (
                <>
                    <p className="px-3 text-sm text-muted">
                        <span className="font-medium text-foreground">
                            {user.username}
                        </span>
                    </p>
                    <form action={logoutAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <SubmitButton
                            variant="secondary"
                            pendingLabel={dictionary.common.working}
                            className="w-full"
                        >
                            {dictionary.nav.logout}
                        </SubmitButton>
                    </form>
                </>
            );
        }

        return (
            <>
                <PendingLink
                    href={localizedHref(locale, '/login')}
                    className={buttonClassName({
                        variant: 'secondary',
                        className: navActiveClassName(
                            loginActive,
                            'w-full',
                        ),
                    })}
                    aria-current={loginActive ? 'page' : undefined}
                >
                    {dictionary.nav.login}
                </PendingLink>
                <PendingLink
                    href={localizedHref(locale, '/register')}
                    className={buttonClassName({
                        className: navActiveClassName(
                            registerActive,
                            'w-full',
                        ),
                    })}
                    aria-current={registerActive ? 'page' : undefined}
                >
                    {dictionary.nav.register}
                </PendingLink>
            </>
        );
    }

    if (user) {
        return (
            <>
                <PendingLink
                    href={localizedHref(locale, '/profile')}
                    className={navActiveClassName(
                        profileActive,
                        profileLinkClassName,
                    )}
                    aria-current={profileActive ? 'page' : undefined}
                    title={user.username}
                >
                    <UserAvatar
                        src={user.image}
                        size="sm"
                        alt={user.username}
                    />
                    <span className="hidden max-w-28 truncate text-sm text-muted xl:inline">
                        {user.username}
                    </span>
                </PendingLink>
                <form action={logoutAction} className="hidden lg:block">
                    <input type="hidden" name="locale" value={locale} />
                    <SubmitButton
                        variant="secondary"
                        pendingLabel={dictionary.common.working}
                        className="min-h-9 px-3 py-1.5"
                    >
                        {dictionary.nav.logout}
                    </SubmitButton>
                </form>
            </>
        );
    }

    return (
        <>
            <PendingLink
                href={localizedHref(locale, '/login')}
                className={navActiveClassName(
                    loginActive,
                    `${linkClassName} hidden lg:inline-flex`,
                )}
                aria-current={loginActive ? 'page' : undefined}
            >
                {dictionary.nav.login}
            </PendingLink>
            <PendingLink
                href={localizedHref(locale, '/register')}
                className={buttonClassName({
                    className: navActiveClassName(
                        registerActive,
                        'hidden min-h-9 px-3 py-1.5 lg:inline-flex',
                    ),
                })}
                aria-current={registerActive ? 'page' : undefined}
            >
                {dictionary.nav.register}
            </PendingLink>
        </>
    );
}
