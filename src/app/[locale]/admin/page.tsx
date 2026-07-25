import Link from 'next/link';

import {
    findAdminHomeCounts,
    type AdminHomeCounts,
} from '@/entities/admin/admin-home.repository';
import { warmAdminListConnection } from '@/entities/question/question.repository';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';

type AdminHomePageProps = {
    params: Promise<{ locale: string }>;
};

function localizedHref(locale: Locale, href: string) {
    return `/${locale}${href}`;
}

const cardClassName =
    'group flex flex-col rounded-lg border border-border bg-surface p-5 shadow-sm transition hover:border-primary/35 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-6';

const cardChevronClassName =
    'text-base font-medium text-primary/70 transition group-hover:translate-x-0.5 group-hover:text-primary';

const statLabelClassName =
    'text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted';

const statValueClassName =
    'font-mono text-2xl font-medium tabular-nums tracking-tight text-foreground sm:text-3xl';

export default async function AdminHomePage({ params }: AdminHomePageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await requireAdmin(safeLocale);

    // Не await: hub остаётся быстрым, а Neon успевает проснуться
    // до клика на /admin/questions (особенно после idle).
    void warmAdminListConnection().catch(() => undefined);

    let counts: AdminHomeCounts | null = null;

    try {
        counts = await findAdminHomeCounts();
    } catch (loadError) {
        // console.warn: console.error в Server Component поднимает Next redbox
        // даже когда ошибка уже обработана (хаб без цифр).
        if (process.env.NODE_ENV === 'development') {
            console.warn(
                '[admin/home] findAdminHomeCounts failed:',
                loadError instanceof Error ? loadError.message : loadError,
            );
        }
    }

    return (
        <main className="mx-auto max-w-5xl px-4 py-5 sm:px-8 sm:py-10">
            <header className="border-b border-border pb-5 sm:pb-6">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {dictionary.admin.homeTitle}
                </h1>

                <p className="mt-2 text-sm text-muted">
                    {dictionary.admin.signedInAs}{' '}
                    <span className="font-medium text-foreground">
                        {session.user.username}
                    </span>
                    .
                </p>

                <p className="mt-1 text-sm text-muted sm:text-base">
                    {dictionary.admin.homeDescription}
                </p>
            </header>

            {counts === null ? (
                <p
                    className="mt-5 rounded-md border border-dashed border-border bg-surface-muted/60 px-4 py-3 text-sm text-muted"
                    role="status"
                >
                    {dictionary.admin.homeCountsUnavailable}
                </p>
            ) : (
                <div className="mt-5 flex items-end gap-3 border border-border border-l-4 border-l-primary bg-surface px-4 py-3 sm:px-5 sm:py-4">
                    <p className={`${statValueClassName} text-primary`}>
                        {counts.sessionsToday}
                    </p>
                    <p className={`${statLabelClassName} pb-1`}>
                        {dictionary.admin.homeStatSessionsToday}
                    </p>
                </div>
            )}

            <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4">
                {/* Hard <a>: soft Link к полному списку после Neon wedge
                    выглядел как «ссылка не работает» (RSC hang без смены URL). */}
                <a
                    href={localizedHref(safeLocale, '/admin/questions')}
                    className={cardClassName}
                >
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                            {dictionary.admin.questionsLink}
                        </h2>
                        <span aria-hidden="true" className={cardChevronClassName}>
                            →
                        </span>
                    </div>

                    {counts !== null ? (
                        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                            <div>
                                <dt className={statLabelClassName}>
                                    {dictionary.admin.homeStatQuestionsActive}
                                </dt>
                                <dd className={`${statValueClassName} mt-1`}>
                                    {counts.questionsActive}
                                </dd>
                            </div>
                            <div>
                                <dt className={statLabelClassName}>
                                    {
                                        dictionary.admin
                                            .homeStatQuestionsInactive
                                    }
                                </dt>
                                <dd
                                    className={`${statValueClassName} mt-1 text-muted`}
                                >
                                    {counts.questionsInactive}
                                </dd>
                            </div>
                        </dl>
                    ) : null}

                    <p className="mt-4 text-sm leading-relaxed text-muted">
                        {dictionary.admin.questionsCardDescription}
                    </p>
                </a>

                <Link
                    href={localizedHref(safeLocale, '/admin/users')}
                    className={cardClassName}
                >
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                            {dictionary.admin.usersLink}
                        </h2>
                        <span aria-hidden="true" className={cardChevronClassName}>
                            →
                        </span>
                    </div>

                    {counts !== null ? (
                        <p
                            className={`${statValueClassName} mt-4 border-t border-border pt-4`}
                            aria-label={`${dictionary.admin.homeStatUsers}: ${counts.usersTotal}`}
                        >
                            {counts.usersTotal}
                        </p>
                    ) : null}

                    <p className="mt-4 text-sm leading-relaxed text-muted">
                        {dictionary.admin.usersCardDescription}
                    </p>
                </Link>
            </div>
        </main>
    );
}
