/**
 * Клиентская панель Timed Mode: компактная карточка → шторка.
 *
 * Зачем Client: форма start (useActionState), чипы сложности, pending.
 * Auth решает Server parent; без сессии в шторке приглашение войти, не
 * «битая» кнопка. Mix = 4-й чип, не отдельная карточка. Тема — ряд
 * `PlayTopicChips`, поле `topic` проверяет сервер (Play topics).
 * Presentation only — scoring / snapshot / submit gate не трогаем.
 */

'use client';

import { useActionState, useId, useState } from 'react';

import { ModeSheetCard } from '@/features/quiz/components/ModeSheetCard';
import { MusicQuestionsToggle } from '@/features/quiz/components/MusicQuestionsToggle';
import { PlayTopicChips } from '@/features/quiz/components/PlayTopicChips';
import { setupDifficultyChipOptions } from '@/features/quiz/lib/difficulty-chip-options';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import { getMixedSplitMetaKey } from '@/features/quiz/lib/mixed-difficulty-split';
import {
    formatBlitzSetup,
    rememberModeSetup,
    type BlitzSetup,
} from '@/features/quiz/lib/mode-setup-memory';
import {
    resolveSelectedTopic,
    usePlayTopics,
} from '@/features/quiz/lib/use-play-topics';
import { startTimedQuizAction } from '@/features/timed-mode/actions';
import { TIMED_MODE_MVP_RULES } from '@/features/timed-mode/types';
import type { Dictionary, Locale } from '@/shared/i18n';
import {
    ChipRadioGroup,
    InlineAlert,
    PendingLink,
    SubmitButton,
    buttonClassName,
} from '@/shared/ui';
import type { QuizSetupDifficulty } from '@/types';

type TimedModeCtaPanelProps = {
    locale: Locale;
    dictionary: Dictionary;
    isAuthenticated: boolean;
    /** Последний выбор из cookie (или значение по умолчанию). */
    initialSetup: BlitzSetup;
    /** «Музыкальные вопросы» из cookie устройства (сервер, главная). */
    initialMusicEnabled: boolean;
};

export function TimedModeCtaPanel({
    locale,
    dictionary,
    isAuthenticated,
    initialSetup,
    initialMusicEnabled,
}: TimedModeCtaPanelProps) {
    const labels = dictionary.timedMode;
    const quizLabels = dictionary.quiz;
    const [state, formAction] = useActionState(startTimedQuizAction, {});
    const [difficulty, setDifficulty] =
        useState<QuizSetupDifficulty>(initialSetup.difficulty);
    const [topic, setTopic] = useState(initialSetup.topic ?? '');
    const topics = usePlayTopics();
    const selectedTopic = resolveSelectedTopic(topics, topic, difficulty);
    const mixedMetaId = useId();
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);
    const mixedMetaKey =
        difficulty === 'MIXED'
            ? getMixedSplitMetaKey(TIMED_MODE_MVP_RULES.questionCount)
            : null;
    const mixedMetaText = mixedMetaKey ? quizLabels[mixedMetaKey] : null;

    return (
        <ModeSheetCard
            glyph="blitz"
            title={labels.title}
            summary={`${labels.eyebrow} · ${labels.meta}`}
            description={labels.description}
            hint={labels.leaderboardHint}
            closeLabel={dictionary.common.close}
            testId="blitz-setup"
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
                    onSubmit={() =>
                        rememberModeSetup(
                            'blitz',
                            formatBlitzSetup({
                                difficulty,
                                topic: selectedTopic || null,
                            }),
                        )
                    }
                    className="space-y-5"
                >
                    <input type="hidden" name="locale" value={locale} />

                    <ChipRadioGroup
                        name="difficulty"
                        legend={quizLabels.difficultyLabel}
                        options={setupDifficultyChipOptions(quizLabels)}
                        value={difficulty}
                        onChange={setDifficulty}
                        describedBy={mixedMetaText ? mixedMetaId : undefined}
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

                    <PlayTopicChips
                        locale={locale}
                        labels={quizLabels}
                        topics={topics}
                        difficulty={difficulty}
                        value={selectedTopic}
                        onChange={setTopic}
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
