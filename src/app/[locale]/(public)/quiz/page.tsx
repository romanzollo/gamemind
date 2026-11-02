import { cookies } from 'next/headers';

import { DailyChallengeCta } from '@/features/daily-challenge/components/daily-challenge-cta';
import { QuizSetupForm } from '@/features/quiz/components/QuizSetupForm';
import { readModeSetupMemory } from '@/features/quiz/lib/mode-setup-memory';
import { SurvivalModeCta } from '@/features/survival-mode/components/SurvivalModeCta';
import { TimedModeCta } from '@/features/timed-mode/components/TimedModeCta';
import { getDictionary, isLocale } from '@/shared/i18n';

// Mode lobby зависит от текущей сессии и состояния Daily Challenge.
// Нельзя кэшировать CTA: stale in_progress/completed ведёт на неверные ссылки.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type QuizSetupPageProps = {
    params: Promise<{ locale: string }>;
};

/**
 * Mode lobby: Челлендж дня целиком (серия, рейтинг дня), ниже — компактные
 * карточки Классики, Блица и Выживания; настройки — в шторке (П2).
 * Классика первой из трёх: самый частый режим.
 * Чипы шторок открываются на прошлом выборе — cookie `mode-setup-memory`.
 */
export default async function QuizSetupPage({ params }: QuizSetupPageProps) {
    const { locale } = await params;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);
    const cookieStore = await cookies();
    const setupMemory = readModeSetupMemory(
        (name) => cookieStore.get(name)?.value,
    );

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <header className="border-b border-border pb-4 sm:pb-5">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {dictionary.quiz.setupTitle}
                </h1>

                <p className="mt-2 max-w-prose text-sm leading-snug text-muted sm:text-base sm:leading-relaxed">
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

            <div className="mt-4 flex flex-col gap-3 sm:mt-5">
                <QuizSetupForm
                    locale={safeLocale}
                    dictionary={dictionary}
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
        </main>
    );
}
