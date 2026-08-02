/**
 * Клиентский CTA-ряд Home (status → иерархия кнопок).
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

type HomeCtaGroupPanelProps = {
    locale: Locale;
    status: DailyChallengePlayerStatus;
    dictionary: Dictionary;
};

const secondaryLinkClassName =
    'text-sm font-medium text-muted underline-offset-4 transition hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function HomeCtaGroupPanel({
    locale,
    status,
    dictionary,
}: HomeCtaGroupPanelProps) {
    const home = dictionary.home;
    const daily = dictionary.dailyChallenge;
    const [state, formAction] = useActionState(startDailyChallengeAction, {});
    const errorMessage = getQuizErrorMessage(dictionary, state.errorCode);

    const modesLink = (
        <PendingLink
            href={`/${locale}/quiz`}
            className={
                status.kind === 'in_progress'
                    ? secondaryLinkClassName
                    : buttonClassName({ className: 'px-5' })
            }
        >
            {status.kind === 'in_progress' ? home.ctaAllModes : home.cta}
        </PendingLink>
    );

    const dailySecondary = (() => {
        if (
            status.kind === 'unavailable' &&
            status.reason === 'insufficient_pool'
        ) {
            return null;
        }

        if (
            status.kind === 'unavailable' &&
            status.reason === 'not_authenticated'
        ) {
            return (
                <PendingLink
                    href={`/${locale}/login`}
                    className={secondaryLinkClassName}
                >
                    {home.dailyTease}
                </PendingLink>
            );
        }

        if (status.kind === 'available') {
            return (
                <form action={formAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <SubmitButton
                        unstyled
                        pendingLabel={dictionary.common.working}
                        className={secondaryLinkClassName}
                    >
                        {home.dailyTease}
                    </SubmitButton>
                </form>
            );
        }

        if (status.kind === 'completed') {
            return (
                <PendingLink
                    href={`/${locale}/result/${status.sessionId}`}
                    className={secondaryLinkClassName}
                >
                    {home.dailyResult}
                </PendingLink>
            );
        }

        return null;
    })();

    if (status.kind === 'in_progress') {
        return (
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
                <PendingLink
                    href={`/${locale}/quiz/${status.sessionId}`}
                    className={buttonClassName({ className: 'px-5' })}
                >
                    {home.dailyContinue}
                </PendingLink>
                {modesLink}
                {errorMessage ? (
                    <InlineAlert className="w-full basis-full">
                        {errorMessage}
                    </InlineAlert>
                ) : null}
            </div>
        );
    }

    return (
        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
            {modesLink}
            {dailySecondary}
            {errorMessage ? (
                <InlineAlert className="w-full basis-full">
                    {errorMessage}
                </InlineAlert>
            ) : null}
        </div>
    );
}
