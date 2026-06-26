import { getDictionary, isLocale } from '@/shared/i18n';

type QuizSessionPageProps = {
    params: Promise<{ locale: string; sessionId: string }>;
};

export default async function QuizSessionPage({ params }: QuizSessionPageProps) {
    const { locale, sessionId } = await params;
    const dictionary = getDictionary(isLocale(locale) ? locale : 'ru');

    return (
        <main className="mx-auto max-w-2xl p-8">
            <h1 className="text-2xl font-semibold">
                {dictionary.quiz.sessionTitle}
            </h1>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                {dictionary.quiz.session}: {sessionId}
            </p>
        </main>
    );
}
