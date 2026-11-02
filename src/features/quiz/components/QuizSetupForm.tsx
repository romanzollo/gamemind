'use client';

import { useActionState, useId, useState } from 'react';

import { GuestPlayPrompt } from '@/features/auth/components/GuestPlayPrompt';
import { startQuizAction } from '@/features/quiz/actions';
import { ModeSheetCard } from '@/features/quiz/components/ModeSheetCard';
import { setupDifficultyChipOptions } from '@/features/quiz/lib/difficulty-chip-options';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import {
    MIXED_QUESTION_COUNTS,
    getMixedSplitMetaKey,
    type MixedQuestionCount,
} from '@/features/quiz/lib/mixed-difficulty-split';
import {
    formatClassicSetup,
    parseClassicQuestionCount,
    rememberModeSetup,
    type ClassicSetup,
} from '@/features/quiz/lib/mode-setup-memory';
import type { Dictionary, Locale } from '@/shared/i18n';
import { ChipRadioGroup, InlineAlert, SubmitButton } from '@/shared/ui';
import type { QuizSetupDifficulty } from '@/types';

type QuizSetupFormProps = {
    locale: Locale;
    dictionary: Dictionary;
    /** Есть сессия (игрок или гость). Без неё — гостевой вход вместо формы. */
    isAuthenticated: boolean;
    /** Последний выбор из cookie (или значения по умолчанию). */
    initialSetup: ClassicSetup;
};

const QUESTION_COUNT_OPTIONS = MIXED_QUESTION_COUNTS.map((count) => ({
    value: String(count),
    label: String(count),
}));

/**
 * Классика на главной: компактная карточка → шторка (сложность и число
 * вопросов чипами). Поля формы те же, что раньше у селектов, —
 * `startQuizAction` и его Zod не меняются. Mix = 4-й чип, сплит — строка
 * под чипами. Классика открыта гостям, поэтому посетителю — гостевой вход.
 */
export function QuizSetupForm({
    locale,
    dictionary,
    isAuthenticated,
    initialSetup,
}: QuizSetupFormProps) {
    const [state, formAction] = useActionState(startQuizAction, {});
    const [difficulty, setDifficulty] = useState<QuizSetupDifficulty>(
        initialSetup.difficulty,
    );
    const [questionCount, setQuestionCount] = useState<MixedQuestionCount>(
        initialSetup.questionCount,
    );
    const mixedMetaId = useId();
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);
    const labels = dictionary.quiz;
    const mixedMetaKey =
        difficulty === 'MIXED' ? getMixedSplitMetaKey(questionCount) : null;
    const mixedMetaText = mixedMetaKey ? labels[mixedMetaKey] : null;

    return (
        <ModeSheetCard
            title={labels.classicTitle}
            summary={`${labels.classicEyebrow} · ${labels.classicMeta}`}
            description={labels.classicDescription}
            hint={labels.classicLeaderboardHint}
            closeLabel={dictionary.common.close}
            testId="classic-setup"
        >
            {!isAuthenticated ? (
                <GuestPlayPrompt locale={locale} dictionary={dictionary} />
            ) : (
                <form
                    action={formAction}
                    onSubmit={() =>
                        rememberModeSetup(
                            'classic',
                            formatClassicSetup({ difficulty, questionCount }),
                        )
                    }
                    className="space-y-5"
                >
                    <input type="hidden" name="locale" value={locale} />
    
                    <ChipRadioGroup
                        name="difficulty"
                        legend={labels.difficultyLabel}
                        options={setupDifficultyChipOptions(labels)}
                        value={difficulty}
                        onChange={setDifficulty}
                        describedBy={mixedMetaText ? mixedMetaId : undefined}
                    />
    
                    <ChipRadioGroup
                        name="questionCount"
                        legend={labels.questionCountLabel}
                        options={QUESTION_COUNT_OPTIONS}
                        value={String(questionCount)}
                        onChange={(value) =>
                            setQuestionCount(
                                parseClassicQuestionCount(value) ?? questionCount,
                            )
                        }
                    />
    
                    {mixedMetaText ? (
                        <p
                            id={mixedMetaId}
                            className="font-mono text-xs tabular-nums text-muted"
                        >
                            <span className="border-l-2 border-primary pl-2">
                                {mixedMetaText}
                            </span>
                        </p>
                    ) : null}
    
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
