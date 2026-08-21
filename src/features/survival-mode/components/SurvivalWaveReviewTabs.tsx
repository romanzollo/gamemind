'use client';

/**
 * Разбор Survival по волнам: сегмент над существующим review API.
 *
 * Каждая волна = отдельная QuizSession. Грузим `/api/result/:id/review`
 * выбранной волны (payload-first, soft-miss). Не мержим run в один JSONB.
 *
 * UX: tab chrome только при 2+ волнах (выбор). Одна волна — сразу panel
 * разбора без «ложной» CTA-кнопки «Волна 1». Canon: Scoreboard Editorial.
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
    const reviewSessionId = selectedWave?.sessionId ?? selectedSessionId;

    const reviewPanel = (
        <QuizResultReviewClientLoader
            sessionId={reviewSessionId}
            locale={locale}
            labels={quizLabels}
            loadingLabel={loadingLabel}
            retryLabel={retryLabel}
        />
    );

    // Одна волна: без сегмента — иначе «Волна 1» конкурирует с primary CTA.
    if (!canSwitch) {
        return <section className="mt-8 sm:mt-10">{reviewPanel}</section>;
    }

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
                className="mt-2 flex flex-wrap gap-0.5 rounded-md border border-border bg-surface-muted/60 p-0.5"
                role="tablist"
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
                            role="tab"
                            id={`survival-wave-tab-${wave.sessionId}`}
                            aria-selected={isSelected}
                            aria-controls="survival-wave-review-panel"
                            aria-label={`${tabLabel}, ${statusLabel}`}
                            onClick={() => {
                                setSelectedSessionId(wave.sessionId);
                            }}
                            className={[
                                'min-h-10 flex-1 rounded-sm px-3 py-1.5 text-center text-sm font-medium',
                                'motion-safe:transition-colors sm:min-w-22 sm:flex-none',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                isSelected
                                    ? 'bg-surface text-foreground shadow-sm'
                                    : 'text-muted hover:text-foreground',
                            ].join(' ')}
                        >
                            {tabLabel}
                        </button>
                    );
                })}
            </div>

            <div
                role="tabpanel"
                id="survival-wave-review-panel"
                aria-labelledby={
                    selectedWave
                        ? `survival-wave-tab-${selectedWave.sessionId}`
                        : 'survival-wave-review-tabs-title'
                }
            >
                {reviewPanel}
            </div>
        </section>
    );
}
