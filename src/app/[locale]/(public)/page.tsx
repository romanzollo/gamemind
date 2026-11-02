import { cookies } from 'next/headers';

import { DailyChallengeCta } from '@/features/daily-challenge/components/daily-challenge-cta';
import { ContinueLastMode } from '@/features/quiz/components/ContinueLastMode';
import { QuizSetupForm } from '@/features/quiz/components/QuizSetupForm';
import {
    readModeSetupMemory,
    type ModeSetupMemory,
    type SetupMode,
} from '@/features/quiz/lib/mode-setup-memory';
import { SurvivalModeCta } from '@/features/survival-mode/components/SurvivalModeCta';
import { TimedModeCta } from '@/features/timed-mode/components/TimedModeCta';
import { auth } from '@/lib/auth';
import { getDictionary, isLocale } from '@/shared/i18n';

// Главная зависит от сессии, состояния Daily и cookie выбора режима.
// Нельзя кэшировать: stale in_progress/completed ведёт на неверные ссылки.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type HomePageProps = {
    params: Promise<{ locale: string }>;
};

/**
 * Что предложить в «Продолжить». Только игроку с сессией; гостю — только
 * Классику: Блиц и Выживание гостям закрыты (3.4), а cookie могла остаться
 * от попытки, которую сервер отклонил.
 */
function resolveContinueMode(
    memory: ModeSetupMemory,
    session: { isGuest: boolean } | null,
): SetupMode | null {
    if (!session || !memory.lastMode) {
        return null;
    }

    if (session.isGuest && memory.lastMode !== 'classic') {
        return null;
    }

    return memory.lastMode;
}

/**
 * Главная = место игры (П1, ADR «Home is the play hub»): Челлендж дня с
 * серией и рейтингом дня → «Продолжить» последний режим → компактные
 * карточки режимов со шторкой настроек (П2). Бывшее лобби `/quiz` ведёт сюда.
 *
 * Посетителю без сессии — короткое вступление сверху; гостевой вход — в
 * карточке дня и в шторке Классики (режимы, открытые гостям).
 */
export default async function HomePage({ params }: HomePageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const session = await auth();
    const sessionUser = session?.user?.id
        ? { isGuest: session.user.isGuest === true }
        : null;
    const cookieStore = await cookies();
    const setupMemory = readModeSetupMemory(
        (name) => cookieStore.get(name)?.value,
    );
    const continueMode = resolveContinueMode(setupMemory, sessionUser);

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            {sessionUser ? (
                <h1 className="sr-only">{dictionary.home.headline}</h1>
            ) : (
                <header className="mb-5 sm:mb-6">
                    <h1 className="text-balance font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        {dictionary.home.headline}
                    </h1>
                    <p className="mt-2 max-w-prose text-pretty text-sm leading-snug text-muted sm:text-base sm:leading-relaxed">
                        {dictionary.home.description}
                    </p>
                </header>
            )}

            <div id="mode-daily" className="scroll-mt-24">
                <DailyChallengeCta locale={safeLocale} dictionary={dictionary} />
            </div>

            {continueMode ? (
                <div className="mt-4">
                    <ContinueLastMode
                        locale={safeLocale}
                        dictionary={dictionary}
                        mode={continueMode}
                        memory={setupMemory}
                    />
                </div>
            ) : null}

            <section aria-labelledby="home-modes-heading" className="mt-6 sm:mt-8">
                <h2
                    id="home-modes-heading"
                    className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
                >
                    {dictionary.quiz.setupTitle}
                </h2>

                <div className="mt-3 flex flex-col gap-3">
                    <QuizSetupForm
                        locale={safeLocale}
                        dictionary={dictionary}
                        isAuthenticated={sessionUser !== null}
                        initialSetup={setupMemory.classic}
                    />

                    <TimedModeCta
                        locale={safeLocale}
                        dictionary={dictionary}
                        initialDifficulty={setupMemory.blitz.difficulty}
                    />

                    <div id="mode-survival" className="scroll-mt-24">
                        <SurvivalModeCta
                            locale={safeLocale}
                            dictionary={dictionary}
                            initialDifficulty={setupMemory.survival.difficulty}
                        />
                    </div>
                </div>
            </section>
        </main>
    );
}
