'use client';

/**
 * Клиентская панель Survival Mode: компактная карточка → шторка.
 *
 * Зачем Client: форма start (useActionState), чипы сложности, pending.
 * Auth решает Server parent; без сессии в шторке приглашение войти, не
 * «битая» кнопка. Mix в MVP нет — Zod режет MIXED, чипа нет.
 * Presentation only. Canon: docs/DECISIONS.md → Survival Mode MVP.
 */

import { useActionState, useState } from 'react';

import { ModeSheetCard } from '@/features/quiz/components/ModeSheetCard';
import { MusicQuestionsToggle } from '@/features/quiz/components/MusicQuestionsToggle';
import { singleDifficultyChipOptions } from '@/features/quiz/lib/difficulty-chip-options';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import { rememberModeSetup } from '@/features/quiz/lib/mode-setup-memory';
import { startSurvivalQuizAction } from '@/features/survival-mode/actions';
import type { SurvivalDifficulty } from '@/features/survival-mode/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import {
    ChipRadioGroup,
    InlineAlert,
    PendingLink,
    SubmitButton,
    buttonClassName,
} from '@/shared/ui';

type SurvivalModeCtaPanelProps = {
    locale: Locale;
    dictionary: Dictionary;
    isAuthenticated: boolean;
    /** Последний выбор из cookie (или значение по умолчанию). */
    initialDifficulty: SurvivalDifficulty;
    /** «Музыкальные вопросы» из cookie устройства (сервер, главная). */
    initialMusicEnabled: boolean;
};

export function SurvivalModeCtaPanel({
    locale,
    dictionary,
    isAuthenticated,
    initialDifficulty,
    initialMusicEnabled,
}: SurvivalModeCtaPanelProps) {
    const labels = dictionary.survivalMode;
    const quizLabels = dictionary.quiz;
    const [state, formAction] = useActionState(startSurvivalQuizAction, {});
    const [difficulty, setDifficulty] =
        useState<SurvivalDifficulty>(initialDifficulty);
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    return (
        <ModeSheetCard
            glyph="survival"
            title={labels.title}
            summary={`${labels.eyebrow} · ${labels.meta}`}
            description={labels.description}
            closeLabel={dictionary.common.close}
            testId="survival-setup"
        >
            {!isAuthenticated ? (
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted">{labels.loginPrompt}</p>
                    <PendingLink
                        href={`/${locale}/login`}
                        className={buttonClassName({ className: 'w-full' })}
                    >
                        {labels.loginLink}
                    </PendingLink>
                </div>
            ) : (
                <form
                    action={formAction}
                    onSubmit={() => rememberModeSetup('survival', difficulty)}
                    className="space-y-5"
                >
                    <input type="hidden" name="locale" value={locale} />

                    <ChipRadioGroup
                        name="difficulty"
                        legend={quizLabels.difficultyLabel}
                        options={singleDifficultyChipOptions(quizLabels)}
                        value={difficulty}
                        onChange={setDifficulty}
                    />

                    <MusicQuestionsToggle
                        label={dictionary.quiz.musicQuestionsLabel}
                        hint={dictionary.quiz.musicQuestionsHint}
                        initialEnabled={initialMusicEnabled}
                    />

                    <SubmitButton
                        pendingLabel={dictionary.common.working}
                        className="w-full"
                    >
                        {labels.startButton}
                    </SubmitButton>
                </form>
            )}

            {errorMessage ? (
                <InlineAlert className="mt-3">{errorMessage}</InlineAlert>
            ) : null}
        </ModeSheetCard>
    );
}
