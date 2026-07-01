import { questionRepository } from '@/entities/question/question.repository';
import { AdminQuestionsTable } from '@/features/admin/components/AdminQuestionsTable';
import { mapAdminQuestions } from '@/features/admin/lib';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';

// тип пропсов страницы администрирования вопросов
type AdminQuestionsPageProps = {
    params: Promise<{ locale: string }>;
};

// страница для администрирования вопросов
export default async function AdminQuestionsPage({
    params,
}: AdminQuestionsPageProps) {
    // получаем параметры из URL
    const { locale } = await params;
    // проверяем локаль
    const safeLocale = isLocale(locale) ? locale : 'ru';
    // получаем словарь
    const dictionary = getDictionary(safeLocale);
    // получаем сессию администратора
    const session = await requireAdmin(safeLocale);

    // получаем все вопросы из базы данных
    const rows = await questionRepository.findAllForAdmin();
    // преобразуем строки вопросов в список вопросов для админ-панели
    const entries = mapAdminQuestions(rows);

    // возвращаем страницу администрирования вопросов
    return (
        <main className="mx-auto max-w-5xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.admin.questionsTitle}
            </h1>

            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.signedInAs} {session.user.username}.
            </p>

            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                {dictionary.admin.listDescription}
            </p>

            <AdminQuestionsTable entries={entries} labels={dictionary.admin} />
        </main>
    );
}
