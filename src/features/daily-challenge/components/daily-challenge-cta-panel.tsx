/**
 * Клиентская панель Daily Challenge (Scoreboard Editorial).
 *
 * Зачем Client: только форма start (useActionState) и pending submit.
 * Статус считает Server parent — сюда приходит уже готовый discriminated union.
 * Presentation only: не трогает scoring/snapshot; action уже готов (урок 4).
 */

'use client';

import { useActionState } from 'react';

import { startDailyChallengeAction } from '@/features/daily-challenge/actions';
import type { DailyChallengePlayerStatus } from '@/features/daily-challenge/types';
import { getQuizErrorMessage } from '@/features/quiz/lib/get-quiz-error-message';
import type { Dictionary, Locale } from '@/shared/i18n';
import {
    InlineAlert,
    PendingLink,
    SubmitButton,
    buttonClassName,
} from '@/shared/ui';

type DailyChallengeCtaPanelProps = {
    locale: Locale;
    status: DailyChallengePlayerStatus;
    dictionary: Dictionary;
    /**
     * true = без своей рамки (родитель `DailyChallengeCta` уже surface),
     * чтобы board мог жить в том же panel.
     */
    embedded?: boolean;
};

export function DailyChallengeCtaPanel({
    locale,
    status,
    dictionary,
    embedded = false,
}: DailyChallengeCtaPanelProps) {
    const labels = dictionary.dailyChallenge;
    const [state, formAction] = useActionState(startDailyChallengeAction, {});
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    const body = (
        <>
            <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted">
                {labels.eyebrow}
            </p>

            <h2
                id="daily-challenge-heading"
                className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            >
                {labels.title}
            </h2>

            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
                {labels.description}
            </p>

            <p className="mt-3 font-mono text-xs tabular-nums text-muted">
                <span className="border-l-2 border-primary pl-2">
                    {labels.meta}
                </span>
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {status.kind === 'unavailable' &&
                status.reason === 'not_authenticated' ? (
                    <>
                        <p className="text-sm text-muted">{labels.loginPrompt}</p>
                        <PendingLink
                            href={`/${locale}/login`}
                            className={buttonClassName({
                                variant: 'secondary',
                                className: 'sm:w-auto',
                            })}
                        >
                            {labels.loginLink}
                        </PendingLink>
                    </>
                ) : null}

                {status.kind === 'unavailable' &&
                status.reason === 'insufficient_pool' ? (
                    <p className="text-sm text-muted" role="status">
                        {labels.unavailablePool}
                    </p>
                ) : null}

                {status.kind === 'unavailable' &&
                status.reason === 'attempt_abandoned' ? (
                    <p className="text-sm text-muted" role="status">
                        {labels.attemptAbandoned}
                    </p>
                ) : null}

                {status.kind === 'available' ? (
                    <form action={formAction} className="w-full sm:w-auto">
                        <input type="hidden" name="locale" value={locale} />
                        <SubmitButton
                            pendingLabel={dictionary.common.working}
                            className="w-full sm:w-auto"
                        >
                            {labels.startButton}
                        </SubmitButton>
                    </form>
                ) : null}

                {status.kind === 'in_progress' ? (
                    <PendingLink
                        href={`/${locale}/quiz/${status.sessionId}`}
                        className={buttonClassName({ className: 'sm:w-auto' })}
                    >
                        {labels.continueButton}
                    </PendingLink>
                ) : null}

                {status.kind === 'completed' ? (
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                        <p className="font-mono text-sm tabular-nums text-foreground">
                            {labels.completedScore
                                .replace('{score}', String(status.score))
                                .replace(
                                    '{correct}',
                                    String(status.correctCount),
                                )
                                .replace(
                                    '{total}',
                                    String(status.totalQuestions),
                                )}
                        </p>
                        <PendingLink
                            href={`/${locale}/result/${status.sessionId}`}
                            className={buttonClassName({
                                variant: 'secondary',
                                className: 'sm:w-auto',
                            })}
                        >
                            {labels.viewResultButton}
                        </PendingLink>
                    </div>
                ) : null}
            </div>

            {errorMessage ? (
                <InlineAlert className="mt-3">{errorMessage}</InlineAlert>
            ) : null}
        </>
    );

    if (embedded) {
        return (
            <div aria-labelledby="daily-challenge-heading">{body}</div>
        );
    }

    return (
        <section
            aria-labelledby="daily-challenge-heading"
            className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5"
        >
            {body}
        </section>
    );
}
