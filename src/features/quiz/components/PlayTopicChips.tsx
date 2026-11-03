/**
 * Ряд «Тема» в шторке Классики и Блица: «Все вопросы» + темы из каталога.
 *
 * Тема, на которой при выбранной сложности мало вопросов, видна, но серая
 * (Микс — нужна на всех трёх). Радио `name="topic"`: «Все вопросы» шлёт
 * пустое значение, сервер читает его как весь банк. Ошибка загрузки тем —
 * ряда нет, форма стартует как раньше.
 */
'use client';

import { useId } from 'react';

import {
    getPlayTopicName,
    isPlayTopicAvailable,
} from '@/entities/play-topic/play-topic';
import type { PlayTopicsState } from '@/features/quiz/lib/use-play-topics';
import type { Dictionary, Locale } from '@/shared/i18n';
import { ChipRadioGroup } from '@/shared/ui';
import type { QuizSetupDifficulty } from '@/types';

type PlayTopicChipsProps = {
    locale: Locale;
    labels: Dictionary['quiz'];
    topics: PlayTopicsState;
    difficulty: QuizSetupDifficulty;
    /** Уже проверенная тема (`resolveSelectedTopic`); '' — все вопросы. */
    value: string;
    onChange: (topicId: string) => void;
};

export function PlayTopicChips({
    locale,
    labels,
    topics,
    difficulty,
    value,
    onChange,
}: PlayTopicChipsProps) {
    const hintId = useId();

    if (topics.status === 'failed') {
        return null;
    }

    const topicOptions =
        topics.status === 'ready'
            ? topics.topics.map((topic) => ({
                  value: topic.id,
                  label: getPlayTopicName(topic, locale),
                  disabled: !isPlayTopicAvailable(topic, difficulty),
              }))
            : [];
    const hasDisabled = topicOptions.some((option) => option.disabled);

    return (
        <div data-testid="topic-chips" aria-busy={topics.status === 'loading'}>
            <ChipRadioGroup
                name="topic"
                legend={labels.topicLabel}
                options={[{ value: '', label: labels.topicAll }, ...topicOptions]}
                value={value}
                onChange={onChange}
                describedBy={hasDisabled ? hintId : undefined}
            />
            {hasDisabled ? (
                <p id={hintId} className="mt-2 text-xs text-muted">
                    {labels.topicUnavailableHint}
                </p>
            ) : null}
        </div>
    );
}
