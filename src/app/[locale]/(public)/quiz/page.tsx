import { DailyChallengeCta } from '@/features/daily-challenge/components/daily-challenge-cta';
import { getDailyChallengePlayerStatus } from '@/features/daily-challenge/lib/get-daily-challenge-player-status';
import { QuizSetupForm } from '@/features/quiz/components/QuizSetupForm';
import { TimedModeCta } from '@/features/timed-mode/components/TimedModeCta';
import { auth } from '@/lib/auth';
import { getDictionary, isLocale } from '@/shared/i18n';

type QuizSetupPageProps = {
    params: Promise<{ locale: string }>;
};

/**
 * Mode lobby: единственное место полных Daily / Timed / Classic.
 * Home только приглашает сюда — без дубля mode cards (IA Model 1).
 * Classic chrome живёт внутри QuizSetupForm (не отдельный eyebrow над карточкой).
 * Если Daily in progress — Blitz CTA secondary, чтобы не спорить с «продолжить».
 */
export default async function QuizSetupPage({ params }: QuizSetupPageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    const session = await auth();
    const dailyStatus = await getDailyChallengePlayerStatus(
        session?.user?.id ?? null,
    );
    const deprioritizeTimed = dailyStatus.kind === 'in_progress';

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

            <div id="mode-daily" className="scroll-mt-24">
                <DailyChallengeCta
                    locale={safeLocale}
                    dictionary={dictionary}
                    className="mt-5 sm:mt-6"
                />
            </div>

            <TimedModeCta
                locale={safeLocale}
                dictionary={dictionary}
                className="mt-4 sm:mt-5"
                startVariant={deprioritizeTimed ? 'secondary' : 'primary'}
            />

            <QuizSetupForm locale={safeLocale} dictionary={dictionary} />
        </main>
    );
}
