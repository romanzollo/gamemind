import Link from 'next/link';

import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';

type AdminHomePageProps = {
    params: Promise<{ locale: string }>;
};

function localizedHref(locale: Locale, href: string) {
    return `/${locale}${href}`;
}

export default async function AdminHomePage({ params }: AdminHomePageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireAdmin(safeLocale);

    return (
        <main className="mx-auto max-w-5xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.admin.homeTitle}
            </h1>

            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.signedInAs} {session.user.username}.
            </p>

            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.homeDescription}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <Link
                    href={localizedHref(safeLocale, '/admin/questions')}
                    className="rounded-lg border border-border bg-surface p-6 transition hover:border-foreground/30 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                    <h2 className="text-lg font-semibold">
                        {dictionary.admin.questionsLink}
                    </h2>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                        {dictionary.admin.questionsCardDescription}
                    </p>
                </Link>

                <Link
                    href={localizedHref(safeLocale, '/admin/users')}
                    className="rounded-lg border border-border bg-surface p-6 transition hover:border-foreground/30 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                    <h2 className="text-lg font-semibold">
                        {dictionary.admin.usersLink}
                    </h2>
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                        {dictionary.admin.usersCardDescription}
                    </p>
                </Link>
            </div>
        </main>
    );
}
