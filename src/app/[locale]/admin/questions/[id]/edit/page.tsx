import { notFound } from 'next/navigation';

import { questionRepository } from '@/entities/question/question.repository';
import { AdminQuestionForm } from '@/features/admin/components/AdminQuestionForm';
import { mapAdminQuestionDetail } from '@/features/admin/lib/map-admin-question-detail';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

// тип пропсов страницы редактирования вопроса
type AdminEditQuestionPageProps = {
    params: Promise<{ locale: string; id: string }>;
};

// страница редактирования вопроса
export default async function AdminEditQuestionPage({
    params,
}: AdminEditQuestionPageProps) {
    // получаем параметры из URL
    const { locale, id } = await params;
    // получаем безопасный локаль
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    await requireAdmin(safeLocale);
    // получаем вопрос для редактирования
    const rawQuestion = await questionRepository.findByIdForAdmin(id);
    // преобразуем вопрос для редактирования
    const question = mapAdminQuestionDetail(rawQuestion);
    // если вопрос не найден, то возвращаем 404
    if (!question) {
        notFound();
    }

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.admin.editTitle}
            </h1>

            <AdminQuestionForm
                locale={safeLocale}
                dictionary={dictionary}
                mode="edit"
                initialValues={question}
            />
        </main>
    );
}
