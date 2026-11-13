'use client';

/**
 * Карточка «Вызов другу» под счётом Классики.
 *
 * Кнопка создаёт вызов (Server Action, проверка партии — на сервере), затем
 * карточка показывает «Поделиться» + Telegram / VK / MAX с готовым текстом.
 * Два шага, а не сразу системное меню: после запроса к серверу браузер
 * (особенно Safari) уже не считает это нажатием и меню не откроет.
 * Квадратики автора приходят с сервера вместе с вызовом (разбор на
 * клиенте к моменту нажатия может ещё грузиться).
 * Canon: docs/DECISIONS.md → Friend challenge.
 */

import { useState, useTransition } from 'react';

import { createFriendChallengeAction } from '@/features/friend-challenge/actions/create-friend-challenge';
import { buildChallengeShare } from '@/features/friend-challenge/lib/build-challenge-share';
import { ShareActions } from '@/features/quiz/components/ShareActions';
import type { Dictionary, Locale } from '@/shared/i18n';
import { InlineAlert, PendingSpinner } from '@/shared/ui';

type FriendChallengeInviteProps = {
    locale: Locale;
    sessionId: string;
    siteOrigin: string;
    creatorName: string;
    /** «Классика · Легко · 3 вопроса» */
    setLine: string;
    /** «2 / 3» */
    score: string;
    /** «Друг сыграет эти же 3 вопроса…» — уже с числом. */
    inviteText: string;
    labels: Dictionary['friendChallenge'];
    shareLabels: Dictionary['share'];
    rateLimitedText: string;
};

/** Скрещённые клинки — знак вызова (в интерфейсе без эмодзи). */
export function ChallengeMark({ className = 'h-4 w-4' }: { className?: string }) {
    return (
        <svg viewBox="0 0 16 16" aria-hidden className={`shrink-0 ${className}`}>
            <path
                d="M2.5 2.5l8 8M13.5 2.5l-8 8M9 12l3 3M7 12l-3 3M11.5 9.5l2 2M4.5 9.5l-2 2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
        </svg>
    );
}

export function FriendChallengeInvite({
    locale,
    sessionId,
    siteOrigin,
    creatorName,
    setLine,
    score,
    inviteText,
    labels,
    shareLabels,
    rateLimitedText,
}: FriendChallengeInviteProps) {
    const [created, setCreated] = useState<{ id: string; marks: boolean[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleCreate() {
        setError(null);
        startTransition(async () => {
            const result = await createFriendChallengeAction({ sessionId, locale });

            if (result.ok) {
                setCreated({ id: result.challengeId, marks: result.creatorMarks });
                return;
            }

            setError(
                result.errorCode === 'RATE_LIMITED' ? rateLimitedText : labels.createFailed,
            );
        });
    }

    const share = created
        ? buildChallengeShare(
              {
                  creatorName,
                  setLine,
                  score,
                  marks: created.marks,
                  url: `${siteOrigin}/${locale}/challenge/${created.id}`,
              },
              {
                  header: labels.shareHeader,
                  scoreLine: labels.shareScore,
                  invite: labels.shareInvite,
                  title: labels.shareTitle,
              },
          )
        : null;

    return (
        <section
            className="mt-4 rounded-lg border border-primary/40 bg-surface p-4 shadow-sm sm:p-6"
            data-testid="friend-challenge-invite"
        >
            <p className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-primary">
                {labels.inviteEyebrow}
            </p>
            <p className="mt-2 text-sm text-foreground sm:text-base">{inviteText}</p>

            {share ? (
                <ShareActions
                    shareWhat="challenge"
                    text={share.text}
                    targets={share.targets}
                    labels={{
                        button: shareLabels.button,
                        copied: labels.linkCopied,
                        copyFailed: shareLabels.copyFailed,
                    }}
                    className="mt-4"
                />
            ) : (
                <button
                    type="button"
                    onClick={handleCreate}
                    disabled={isPending}
                    aria-busy={isPending}
                    data-testid="friend-challenge-create"
                    className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-primary bg-surface px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-colors sm:w-auto"
                >
                    {isPending ? <PendingSpinner /> : <ChallengeMark />}
                    {labels.inviteButton}
                </button>
            )}

            {error ? <InlineAlert className="mt-3">{error}</InlineAlert> : null}
        </section>
    );
}
