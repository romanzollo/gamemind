import { startQuizAction } from '@/features/quiz/actions';
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

            <form action={startQuizAction} className="mt-6 flex flex-col gap-4">
                <input type="hidden" name="locale" value={safeLocale} />

                <label className="flex flex-col gap-2">
                    <span>{dictionary.quiz.difficultyLabel}</span>
                    <select name="difficulty" defaultValue="EASY" required>
                        <option value="EASY">{dictionary.quiz.easy}</option>
                        <option value="MEDIUM">{dictionary.quiz.medium}</option>
                        <option value="HARD">{dictionary.quiz.hard}</option>
                    </select>
                </label>

                <label className="flex flex-col gap-2">
                    <span>{dictionary.quiz.questionCountLabel}</span>
                    <select name="questionCount" defaultValue="5" required>
                        <option value="3">3</option>
                        {/* <option value="5">5</option>
                        <option value="10">10</option> */}
                    </select>
                </label>

                <button
                    type="submit"
                    className="rounded bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300 dark:focus-visible:outline-neutral-100"
                >
                    {dictionary.quiz.startButton}
                </button>
            </form>
        </main>
    );
}
