import { getDictionary, isLocale } from '@/shared/i18n';

type QuizSetupPageProps = {
    params: Promise<{ locale: string }>;
};

export default async function QuizSetupPage({ params }: QuizSetupPageProps) {
    const { locale } = await params;
    const dictionary = getDictionary(isLocale(locale) ? locale : 'ru');

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.quiz.setupTitle}
            </h1>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.quiz.setupDescription}
            </p>
        </main>
    );
}
