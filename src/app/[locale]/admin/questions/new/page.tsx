import Link from 'next/link';

import { AdminQuestionForm } from '@/features/admin/components/AdminQuestionForm';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';

type AdminNewQuestionPageProps = {
    params: Promise<{ locale: string }>;
};

function localizedHref(locale: Locale, href: string) {
    return `/${locale}${href}`;
}

export default async function AdminNewQuestionPage({
    params,
}: AdminNewQuestionPageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    await requireAdmin(safeLocale);

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {dictionary.admin.createTitle}
                </h1>
                <Link
                    href={localizedHref(safeLocale, '/admin/questions')}
                    className={buttonClassName({
                        variant: 'secondary',
                        className: 'min-h-10 px-3 text-sm sm:min-h-11',
                    })}
                >
                    {dictionary.admin.questionsLink}
                </Link>
            </div>

            <AdminQuestionForm locale={safeLocale} dictionary={dictionary} />
        </main>
    );
}
