import { QuizSetupForm } from '@/features/quiz/components/QuizSetupForm';
import { getDictionary, isLocale } from '@/shared/i18n';

type QuizSetupPageProps = {
    params: Promise<{ locale: string }>;
};

export default async function QuizSetupPage({ params }: QuizSetupPageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    return (
        <main className="mx-auto max-w-2xl px-4 py-6 sm:px-8 sm:py-8">
            <header className="pb-4 sm:pb-6">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {dictionary.quiz.setupTitle}
                </h1>

                <p className="mt-2 text-sm text-muted sm:text-base">
                    {dictionary.quiz.setupDescription}
                </p>
            </header>

            <QuizSetupForm locale={safeLocale} dictionary={dictionary} />
        </main>
    );
}
