import Link from 'next/link';
import type { Role } from '@prisma/client';

import { logoutAction } from '@/features/auth/actions';
import type { Dictionary, Locale } from '@/shared/i18n';
import { UserAvatar } from '@/shared/ui';

type NavUser = {
    username: string;
    role: Role;
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

export function HeaderAuthControls({
    locale,
    dictionary,
    user,
}: HeaderAuthControlsProps) {
    if (user) {
        return (
            <>
                <Link
                    href={localizedHref(locale, '/profile')}
                    className="flex items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                    <UserAvatar
                        src={user.image}
                        size="sm"
                        alt={user.username}
                    />
                    <span className="hidden text-sm text-muted sm:inline">
                        {user.username}
                    </span>
                </Link>
                <form action={logoutAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <button
                        type="submit"
                        className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                        {dictionary.nav.logout}
                    </button>
                </form>
            </>
        );
    }

    return (
        <>
            <Link
                href={localizedHref(locale, '/login')}
                className={linkClassName}
            >
                {dictionary.nav.login}
            </Link>
            <Link
                href={localizedHref(locale, '/register')}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
                {dictionary.nav.register}
            </Link>
        </>
    );
}
