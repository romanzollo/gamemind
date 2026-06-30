import { QuizSetupForm } from '@/features/quiz/components/QuizSetupForm';
import { getDictionary, isLocale } from '@/shared/i18n';

type QuizSetupPageProps = {
    params: Promise<{ locale: string }>;
};

// Страница настройки викторины
export default async function QuizSetupPage({ params }: QuizSetupPageProps) {
    const { locale } = await params;
    // получаем локаль из параметров
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.quiz.setupTitle}
            </h1>

            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.quiz.setupDescription}
            </p>

            <QuizSetupForm locale={safeLocale} dictionary={dictionary} />
        </main>
    );
}
