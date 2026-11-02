/**
 * «Продолжить» на главной: последний режим из шторки в одно касание (П1).
 *
 * Настройки берутся из cookie `mode-setup-memory` (её пишет шторка при
 * «Начать»), форма — та же, что в шторке, только со скрытыми полями: старт
 * идёт через обычный Server Action режима с его Zod. Своих проверок прав
 * здесь нет — гостю Блиц / Выживание не показывает вызывающая страница,
 * а действие всё равно перенаправит гостя само.
 */
'use client';

import { useActionState } from 'react';

import { startQuizAction } from '@/features/quiz/actions';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type {
    ModeSetupMemory,
    SetupMode,
} from '@/features/quiz/lib/mode-setup-memory';
import type { QuizFormState } from '@/features/quiz/types';
import { startSurvivalQuizAction } from '@/features/survival-mode/actions';
import { startTimedQuizAction } from '@/features/timed-mode/actions';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, SubmitButton } from '@/shared/ui';
import type { QuizSetupDifficulty } from '@/types';

type ContinueLastModeProps = {
    locale: Locale;
    dictionary: Dictionary;
    mode: SetupMode;
    memory: ModeSetupMemory;
};

type StartAction = (
    state: QuizFormState,
    formData: FormData,
) => Promise<QuizFormState>;

const START_ACTIONS: Record<SetupMode, StartAction> = {
    classic: startQuizAction,
    blitz: startTimedQuizAction,
    survival: startSurvivalQuizAction,
};

function difficultyLabel(
    labels: Dictionary['quiz'],
    difficulty: QuizSetupDifficulty,
): string {
    switch (difficulty) {
        case 'EASY':
            return labels.easy;
        case 'MEDIUM':
            return labels.medium;
        case 'HARD':
            return labels.hard;
        case 'MIXED':
            return labels.mixed;
    }
}

/** Строка «Классика · Сложно · 5» и поля формы для режима. */
function describeLastMode(
    dictionary: Dictionary,
    mode: SetupMode,
    memory: ModeSetupMemory,
): { summary: string; fields: Record<string, string> } {
    const quiz = dictionary.quiz;

    switch (mode) {
        case 'classic':
            return {
                summary: [
                    quiz.classicTitle,
                    difficultyLabel(quiz, memory.classic.difficulty),
                    String(memory.classic.questionCount),
                ].join(' · '),
                fields: {
                    difficulty: memory.classic.difficulty,
                    questionCount: String(memory.classic.questionCount),
                },
            };
        case 'blitz':
            return {
                summary: [
                    dictionary.timedMode.title,
                    difficultyLabel(quiz, memory.blitz.difficulty),
                ].join(' · '),
                fields: { difficulty: memory.blitz.difficulty },
            };
        case 'survival':
            return {
                summary: [
                    dictionary.survivalMode.title,
                    difficultyLabel(quiz, memory.survival.difficulty),
                ].join(' · '),
                fields: { difficulty: memory.survival.difficulty },
            };
    }
}

export function ContinueLastMode({
    locale,
    dictionary,
    mode,
    memory,
}: ContinueLastModeProps) {
    const [state, formAction] = useActionState(START_ACTIONS[mode], {});
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);
    const { summary, fields } = describeLastMode(dictionary, mode, memory);
    const labels = dictionary.home;

    return (
        <section
            aria-labelledby="continue-last-mode-heading"
            className="rounded-lg border border-border bg-surface px-4 py-3.5 shadow-sm sm:px-5 sm:py-4"
            data-testid="continue-last-mode"
        >
            <form
                action={formAction}
                className="flex items-center gap-3"
            >
                <input type="hidden" name="locale" value={locale} />
                {Object.entries(fields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                ))}

                <div className="min-w-0 flex-1">
                    <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted">
                        {labels.continueEyebrow}
                    </p>
                    <h2
                        id="continue-last-mode-heading"
                        className="mt-1 font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl"
                    >
                        {summary}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">
                        {labels.continueHint}
                    </p>
                </div>

                <SubmitButton
                    pendingLabel={dictionary.common.working}
                    className="shrink-0 px-5"
                >
                    {labels.continueButton}
                </SubmitButton>
            </form>

            {errorMessage ? (
                <InlineAlert className="mt-3">{errorMessage}</InlineAlert>
            ) : null}
        </section>
    );
}
