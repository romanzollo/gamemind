/**
 * «Ты против автора» на результате попытки вызова (Server Component).
 *
 * Своим запросом в Suspense: счёт и кнопки результата его не ждут. Читает
 * строку вызова и свои ответы (QuizAnswer) — без JSONB партии; текстов
 * вопросов и правильных ответов здесь нет, только ✓/✗ и очки.
 * Сбой чтения — блока просто нет (результат уже на экране).
 * Canon: docs/DECISIONS.md → Friend challenge.
 */

import Link from 'next/link';

import { friendChallengeRepository } from '@/entities/friend-challenge/friend-challenge.repository';
import { ChallengeMarks } from '@/features/friend-challenge/components/ChallengeMarks';
import {
    getChallengeOutcome,
    orderMarks,
    type ChallengeOutcome,
} from '@/features/friend-challenge/lib/challenge-rules';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import type { Dictionary, Locale } from '@/shared/i18n';
import { UserAvatar } from '@/shared/ui';
import { getAvatarPattern } from '@/shared/ui/avatar-pattern';

type FriendChallengeVersusProps = {
    challengeId: string;
    sessionId: string;
    userId: string;
    userImage: string | null;
    myScore: number;
    locale: Locale;
    dictionary: Dictionary;
};

const OUTCOME_CLASS: Record<ChallengeOutcome, string> = {
    win: 'bg-success-muted text-success',
    draw: 'bg-surface-muted text-foreground',
    loss: 'bg-surface-muted text-muted',
};

function VersusRow(props: {
    name: string;
    image: string | null;
    pattern: number;
    marks: boolean[];
    score: number;
    leading: boolean;
}) {
    const correct = props.marks.filter(Boolean).length;

    return (
        <li className="flex items-center gap-3 py-3">
            <UserAvatar src={props.image} pattern={props.pattern} size="sm" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{props.name}</p>
                <div className="mt-1">
                    <ChallengeMarks
                        marks={props.marks}
                        label={`${correct}/${props.marks.length}`}
                        size="sm"
                    />
                </div>
            </div>
            <p
                className={`font-display text-3xl font-bold tabular-nums ${
                    props.leading ? 'text-foreground' : 'text-muted'
                }`}
            >
                {props.score}
            </p>
        </li>
    );
}

export async function FriendChallengeVersus({
    challengeId,
    sessionId,
    userId,
    userImage,
    myScore,
    locale,
    dictionary,
}: FriendChallengeVersusProps) {
    const labels = dictionary.friendChallenge;
    let data: Awaited<ReturnType<typeof friendChallengeRepository.findVersus>> = null;

    try {
        data = await friendChallengeRepository.findVersus(challengeId, sessionId, userId);
    } catch (error) {
        captureAppError(error, {
            area: 'friend-challenge',
            level: 'warning',
            extra: { stage: 'versus', sessionId },
        });
        return null;
    }

    if (!data) {
        return null;
    }

    const { challenge, answers } = data;
    const outcome = getChallengeOutcome(myScore, challenge.creatorScore);
    const outcomeLabel =
        outcome === 'win'
            ? labels.outcomeWin
            : outcome === 'draw'
              ? labels.outcomeDraw
              : labels.outcomeLoss;

    return (
        <section
            className={`mt-4 rounded-lg border bg-surface p-4 shadow-sm sm:p-6 ${
                outcome === 'win' ? 'border-success/40' : 'border-border'
            }`}
            data-testid="friend-challenge-versus"
        >
            <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
                    {labels.versusEyebrow}
                </p>
                <span
                    className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${OUTCOME_CLASS[outcome]}`}
                    data-outcome={outcome}
                >
                    {outcomeLabel}
                </span>
            </div>

            <ul className="mt-1 divide-y divide-border">
                <VersusRow
                    name={labels.you}
                    image={userImage}
                    pattern={getAvatarPattern(userId)}
                    marks={orderMarks(challenge.questionIds, answers)}
                    score={myScore}
                    leading={outcome !== 'loss'}
                />
                <VersusRow
                    name={challenge.creatorUsername ?? labels.deletedPlayer}
                    image={challenge.creatorImage}
                    pattern={getAvatarPattern(challenge.creatorUserId ?? challenge.id)}
                    marks={challenge.creatorMarks}
                    score={challenge.creatorScore}
                    leading={outcome !== 'win'}
                />
            </ul>

            <Link
                href={`/${locale}/challenge/${challenge.id}`}
                className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
                {labels.allTakers}
            </Link>
        </section>
    );
}
