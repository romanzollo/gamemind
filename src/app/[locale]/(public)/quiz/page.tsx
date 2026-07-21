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
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <header className="border-b border-border pb-4 sm:pb-5">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {dictionary.quiz.setupTitle}
                </h1>

                <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted sm:text-base">
                    {dictionary.quiz.setupDescription}
                </p>
            </header>

            <QuizSetupForm locale={safeLocale} dictionary={dictionary} />
        </main>
    );
}
