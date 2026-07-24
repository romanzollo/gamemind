import Link from 'next/link';

import { warmAdminListConnection } from '@/entities/question/question.repository';
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

    // Не await: hub остаётся быстрым, а Neon успевает проснуться
    // до клика на /admin/questions (особенно после idle).
    void warmAdminListConnection().catch(() => undefined);

    return (
        <main className="mx-auto max-w-5xl px-4 py-5 sm:px-8 sm:py-10">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {dictionary.admin.homeTitle}
            </h1>

            <p className="mt-2 text-sm text-muted sm:text-base">
                {dictionary.admin.signedInAs} {session.user.username}.
            </p>

            <p className="mt-1 text-sm text-muted sm:text-base">
                {dictionary.admin.homeDescription}
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {/* Hard <a>: soft Link к полному списку после Neon wedge
                    выглядел как «ссылка не работает» (RSC hang без смены URL). */}
                <a
                    href={localizedHref(safeLocale, '/admin/questions')}
                    className="rounded-lg border border-border bg-surface p-6 transition hover:border-foreground/30 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                    <h2 className="text-lg font-semibold text-foreground">
                        {dictionary.admin.questionsLink}
                    </h2>
                    <p className="mt-2 text-sm text-muted">
                        {dictionary.admin.questionsCardDescription}
                    </p>
                </a>

                <Link
                    href={localizedHref(safeLocale, '/admin/users')}
                    className="rounded-lg border border-border bg-surface p-6 transition hover:border-foreground/30 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                    <h2 className="text-lg font-semibold text-foreground">
                        {dictionary.admin.usersLink}
                    </h2>
                    <p className="mt-2 text-sm text-muted">
                        {dictionary.admin.usersCardDescription}
                    </p>
                </Link>
            </div>
        </main>
    );
}
