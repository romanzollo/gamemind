/**
 * Страница «Вызова другу» — сюда ведёт ссылка из мессенджера.
 *
 * Публичная: превью и «кто вызывает» видно без входа. Дальше по зрителю:
 * - не вошёл — «Принять без регистрации» (гость) / «Войти и принять»,
 *   оба возвращают сюда (`next`);
 * - вошёл, ещё не играл (или игра идёт) — «Принять вызов»;
 * - автор или уже сыгравший — список всех, кто принял, автору ещё и
 *   «Поделиться» ещё раз.
 * Только скаляры вызова и результатов; вопросы и ответы здесь не видны.
 * force-dynamic + soft-miss (как result): без «липкого» notFound().
 * Canon: docs/DECISIONS.md → Friend challenge.
 */

import type { Metadata } from 'next';
import { connection } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import Link from 'next/link';

import {
    friendChallengeRepository,
    isFriendChallengeId,
    type FriendChallenge,
} from '@/entities/friend-challenge/friend-challenge.repository';
import { ChallengeMarks } from '@/features/friend-challenge/components/ChallengeMarks';
import { ChallengeFacts } from '@/features/friend-challenge/components/ChallengeFacts';
import {
    ChallengeAcceptForm,
    ChallengeGuestAccept,
} from '@/features/friend-challenge/components/ChallengeAcceptForms';
import { ChallengeShareRow } from '@/features/friend-challenge/components/ChallengeShareRow';
import { ChallengeTakers } from '@/features/friend-challenge/components/ChallengeTakers';
import {
    buildChallengeSetLine,
    formatChallengeScore,
} from '@/features/friend-challenge/lib/challenge-labels';
import {
    getChallengeMaxScore,
    getChallengeSetupDifficulty,
} from '@/features/friend-challenge/lib/challenge-rules';
import { auth } from '@/lib/auth';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { SITE_ORIGIN } from '@/shared/config/site';
import { formatPlural, getDictionary, isLocale, type Locale } from '@/shared/i18n';
import { buttonClassName, InlineAlert, UserAvatar } from '@/shared/ui';
import { getAvatarPattern } from '@/shared/ui/avatar-pattern';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ChallengePageProps = {
    params: Promise<{ locale: string; challengeId: string }>;
};

function describeChallenge(challenge: FriendChallenge, locale: Locale) {
    const dictionary = getDictionary(locale);
    const maxScore = getChallengeMaxScore(
        challenge.poolKind,
        challenge.difficulty,
        challenge.questionCount,
    );

    return {
        creatorName: challenge.creatorUsername ?? dictionary.friendChallenge.deletedPlayer,
        score: formatChallengeScore(challenge.creatorScore, maxScore),
        setLine: buildChallengeSetLine(
            dictionary,
            locale,
            getChallengeSetupDifficulty(challenge.poolKind, challenge.difficulty),
            challenge.questionCount,
        ),
        questions: formatPlural(
            locale,
            challenge.questionCount,
            dictionary.friendChallenge.questions,
        ),
    };
}

/** Заголовок превью — жирная строка в Telegram; страницу не индексируем. */
export async function generateMetadata({ params }: ChallengePageProps): Promise<Metadata> {
    const { locale: rawLocale, challengeId } = await params;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const labels = getDictionary(locale).friendChallenge;
    const challenge = isFriendChallengeId(challengeId)
        ? await friendChallengeRepository.findById(challengeId).catch(() => null)
        : null;

    if (!challenge) {
        return { robots: { index: false } };
    }

    const view = describeChallenge(challenge, locale);
    const title = labels.shareTitle
        .replace('{name}', view.creatorName)
        .replace('{score}', view.score);
    const description = labels.ogDescription.replace('{questions}', view.questions);

    return {
        title,
        description,
        robots: { index: false },
        openGraph: { title, description, siteName: 'GameMind', type: 'website' },
    };
}

export default async function ChallengePage({ params }: ChallengePageProps) {
    noStore();
    await connection();

    const { locale: rawLocale, challengeId } = await params;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const dictionary = getDictionary(locale);
    const labels = dictionary.friendChallenge;
    const session = await auth();
    const viewerId = session?.user?.id ?? null;

    let state: Awaited<ReturnType<typeof friendChallengeRepository.findPageState>> = null;
    let loadFailed = false;

    if (isFriendChallengeId(challengeId)) {
        try {
            state = await friendChallengeRepository.findPageState(challengeId, viewerId);
        } catch (error) {
            console.error('Friend challenge page load failed:', error);
            captureAppError(error, {
                area: 'friend-challenge',
                level: 'warning',
                extra: { stage: 'page' },
            });
            loadFailed = true;
        }
    }

    if (!state) {
        return (
            <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
                <InlineAlert tone="warning" role="status">
                    {loadFailed ? dictionary.quiz.errors.resultLoadFailed : labels.errors.expired}
                </InlineAlert>
                <Link
                    href={`/${locale}`}
                    className={buttonClassName({ className: 'mt-4 w-full sm:w-auto' })}
                >
                    {dictionary.nav.quiz}
                </Link>
            </main>
        );
    }

    const { challenge, attempt, takers } = state;
    const view = describeChallenge(challenge, locale);
    const isCreator = viewerId != null && challenge.creatorUserId === viewerId;
    const hasPlayed = attempt?.status === 'COMPLETED' || attempt?.status === 'ABANDONED';
    const showTakers = isCreator || hasPlayed;
    const selfPath = `/${locale}/challenge/${challenge.id}`;
    const creatorCorrect = challenge.creatorMarks.filter(Boolean).length;

    return (
        <main className="mx-auto max-w-2xl px-4 py-5 sm:px-8 sm:py-10">
            <section
                className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6"
                data-testid="friend-challenge-page"
            >
                <p className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-primary">
                    {showTakers ? labels.versusEyebrow : labels.pageEyebrow}
                </p>

                <div className="mt-3 flex items-center gap-3">
                    <UserAvatar
                        src={challenge.creatorImage}
                        pattern={getAvatarPattern(challenge.creatorUserId ?? challenge.id)}
                        size="base"
                    />
                    <div className="min-w-0">
                        <h1 className="truncate font-display text-3xl font-bold leading-tight text-foreground">
                            {view.creatorName}
                        </h1>
                        {showTakers ? null : (
                            <p className="text-sm text-muted">{labels.pageSubtitle}</p>
                        )}
                    </div>
                </div>

                <div className="mt-4 flex items-end justify-between gap-3 rounded-md bg-surface-muted p-3 sm:p-4">
                    <div>
                        <p className="font-mono text-2xs font-medium uppercase tracking-[0.14em] text-muted">
                            {/* Автору и сыгравшим это уже не «счёт соперника». */}
                            {showTakers ? dictionary.quiz.scoreLabel : labels.scoreToBeat}
                        </p>
                        <p className="font-display text-4xl font-bold tabular-nums text-foreground">
                            {view.score}
                        </p>
                    </div>
                    <div className="pb-1">
                        <ChallengeMarks
                            marks={challenge.creatorMarks}
                            label={`${creatorCorrect}/${challenge.questionCount}`}
                        />
                    </div>
                </div>

                <ChallengeFacts
                    setLine={view.setLine}
                    sameQuestions={labels.ruleSame}
                    oneTry={labels.ruleOneTry}
                />

                {isCreator ? (
                    <ChallengeShareRow
                        locale={locale}
                        url={`${SITE_ORIGIN}${selfPath}`}
                        creatorName={view.creatorName}
                        setLine={view.setLine}
                        score={view.score}
                        marks={challenge.creatorMarks}
                        labels={labels}
                        shareLabels={dictionary.share}
                    />
                ) : hasPlayed ? null : viewerId ? (
                    <ChallengeAcceptForm locale={locale} challengeId={challenge.id} />
                ) : (
                    <>
                        <ChallengeGuestAccept locale={locale} next={selfPath} />
                        <Link
                            href={`/${locale}/login?next=${encodeURIComponent(selfPath)}`}
                            className={buttonClassName({
                                variant: 'secondary',
                                className: 'mt-2 w-full',
                            })}
                        >
                            {labels.acceptLogin}
                        </Link>
                    </>
                )}
            </section>

            {showTakers ? (
                <ChallengeTakers
                    takers={takers}
                    viewerId={viewerId}
                    maxScore={getChallengeMaxScore(
                        challenge.poolKind,
                        challenge.difficulty,
                        challenge.questionCount,
                    )}
                    title={labels.allTakers}
                    emptyText={labels.takersEmpty}
                    youLabel={labels.you}
                />
            ) : takers.length > 0 ? (
                <p className="mt-3 text-center text-sm text-muted">
                    {labels.takenBy.replace('{count}', String(takers.length))}
                </p>
            ) : null}
        </main>
    );
}
