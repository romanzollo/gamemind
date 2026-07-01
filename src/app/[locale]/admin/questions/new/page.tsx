import { AdminQuestionForm } from '@/features/admin/components/AdminQuestionForm';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

// тип пропсов страницы создания нового вопроса
type AdminNewQuestionPageProps = {
    params: Promise<{ locale: string }>;
};

// страница создания нового вопроса
export default async function AdminNewQuestionPage({
    params,
}: AdminNewQuestionPageProps) {
    // получаем параметры из URL
    const { locale } = await params;
    // проверяем локаль
    const safeLocale = isLocale(locale) ? locale : 'ru';
    // получаем словарь
    const dictionary = getDictionary(safeLocale);

    // проверяем, является ли пользователь администратором
    await requireAdmin(safeLocale);

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.admin.createTitle}
            </h1>

            <AdminQuestionForm locale={safeLocale} dictionary={dictionary} />
        </main>
    );
}
