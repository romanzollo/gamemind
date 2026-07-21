import Link from 'next/link';
import { notFound } from 'next/navigation';

import { questionRepository } from '@/entities/question/question.repository';
import { AdminQuestionForm } from '@/features/admin/components/AdminQuestionForm';
import { mapAdminQuestionDetail } from '@/features/admin/lib/map-admin-question-detail';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { buttonClassName } from '@/shared/ui';

type AdminEditQuestionPageProps = {
    params: Promise<{ locale: string; id: string }>;
};

function localizedHref(locale: Locale, href: string) {
    return `/${locale}${href}`;
}

export default async function AdminEditQuestionPage({
    params,
}: AdminEditQuestionPageProps) {
    const { locale, id } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    await requireAdmin(safeLocale);
    const rawQuestion = await questionRepository.findByIdForAdmin(id);
    const question = mapAdminQuestionDetail(rawQuestion);
    if (!question) {
        notFound();
    }

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {dictionary.admin.editTitle}
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

            <AdminQuestionForm
                locale={safeLocale}
                dictionary={dictionary}
                mode="edit"
                initialValues={question}
            />
        </main>
    );
}
