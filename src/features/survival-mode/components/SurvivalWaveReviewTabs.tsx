'use client';

/**
 * Разбор Survival по волнам: сегмент над существующим review API.
 *
 * Каждая волна = отдельная QuizSession. Грузим `/api/result/:id/review`
 * выбранной волны (payload-first, soft-miss). Не мержим run в один JSONB.
 * Таб-хром всегда (и после волны 1) — Scoreboard Editorial, не «голый» Classic.
 * 2+ волны — переключение сессий.
 *
 * Canon: docs/QUIZ_NEON_HOT_PATH.md (review after complete, non-blocking).
 */

import { useState } from 'react';

import { QuizResultReviewClientLoader } from '@/features/quiz/components/QuizResultReviewClientLoader';
import type { Dictionary, Locale } from '@/shared/i18n';
import { EmptyState } from '@/shared/ui';

export type SurvivalWaveReviewTab = {
    sessionId: string;
    waveIndex: number;
    clockOk: boolean;
};

type SurvivalWaveReviewTabsProps = {
    waves: SurvivalWaveReviewTab[];
    currentSessionId: string;
    locale: Locale;
    quizLabels: Dictionary['quiz'];
    survivalLabels: Dictionary['survivalMode'];
    loadingLabel: string;
    retryLabel: string;
};

function pickInitialSessionId(
    waves: SurvivalWaveReviewTab[],
    currentSessionId: string,
): string {
    if (waves.some((wave) => wave.sessionId === currentSessionId)) {
        return currentSessionId;
    }

    return waves[0]?.sessionId ?? currentSessionId;
}

export function SurvivalWaveReviewTabs({
    waves,
    currentSessionId,
    locale,
    quizLabels,
    survivalLabels,
    loadingLabel,
    retryLabel,
}: SurvivalWaveReviewTabsProps) {
    const [selectedSessionId, setSelectedSessionId] = useState(() =>
        pickInitialSessionId(waves, currentSessionId),
    );

    if (waves.length === 0) {
        return (
            <EmptyState
                className="mt-8"
                title={survivalLabels.reviewWavesEmpty}
            />
        );
    }

    const canSwitch = waves.length > 1;
    const selectedWave =
        waves.find((wave) => wave.sessionId === selectedSessionId) ?? waves[0];

    return (
        <section
            className="mt-8 sm:mt-10"
            aria-labelledby="survival-wave-review-tabs-title"
        >
            <p
                id="survival-wave-review-tabs-title"
                className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted"
            >
                {survivalLabels.reviewWavesEyebrow}
            </p>

            <div
                className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-border bg-surface p-1 sm:flex sm:flex-wrap"
                role={canSwitch ? 'tablist' : 'group'}
                aria-label={survivalLabels.reviewWavesEyebrow}
            >
                {waves.map((wave) => {
                    const isSelected = wave.sessionId === selectedSessionId;
                    const tabLabel = survivalLabels.reviewWaveTabLabel.replace(
                        '{n}',
                        String(wave.waveIndex),
                    );
                    const statusLabel = wave.clockOk
                        ? survivalLabels.waveCountedStatus
                        : survivalLabels.waveNotCountedStatus;

                    return (
                        <button
                            key={wave.sessionId}
                            type="button"
                            role={canSwitch ? 'tab' : undefined}
                            id={`survival-wave-tab-${wave.sessionId}`}
                            aria-selected={canSwitch ? isSelected : undefined}
                            aria-current={
                                !canSwitch && isSelected ? 'true' : undefined
                            }
                            aria-controls="survival-wave-review-panel"
                            aria-label={`${tabLabel}, ${statusLabel}`}
                            disabled={!canSwitch}
                            onClick={() => {
                                if (canSwitch) {
                                    setSelectedSessionId(wave.sessionId);
                                }
                            }}
                            className={[
                                'min-h-11 rounded-sm px-2 py-2 text-center text-sm font-semibold',
                                'motion-safe:transition-colors sm:min-w-22 sm:flex-1',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                isSelected
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted hover:bg-surface-hover hover:text-foreground',
                                !canSwitch
                                    ? 'col-span-2 cursor-default sm:flex-none sm:min-w-28'
                                    : '',
                            ].join(' ')}
                        >
                            {tabLabel}
                        </button>
                    );
                })}
            </div>

            <div
                role={canSwitch ? 'tabpanel' : undefined}
                id="survival-wave-review-panel"
                aria-labelledby={
                    selectedWave
                        ? `survival-wave-tab-${selectedWave.sessionId}`
                        : 'survival-wave-review-tabs-title'
                }
            >
                <QuizResultReviewClientLoader
                    sessionId={selectedSessionId}
                    locale={locale}
                    labels={quizLabels}
                    loadingLabel={loadingLabel}
                    retryLabel={retryLabel}
                />
            </div>
        </section>
    );
}
