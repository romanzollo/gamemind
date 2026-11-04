/**
 * Server CTA Daily Challenge: auth (optional) → статус → панель + рейтинг дня.
 *
 * Живёт на главной — месте игры (ADR «Home is the play hub») и стоит
 * первой: это «герой» экрана, поэтому акцентная полоса слева и крупный
 * заголовок. Чтение через `getDailyLobbyView` (один Direct TLS на happy
 * path; место в рейтинге — тем же соединением, только после игры).
 */

import {
    DailyChallengeBoard,
    type DailyBoardYou,
} from '@/features/daily-challenge/components/daily-challenge-board';
import { DailyChallengeCtaPanel } from '@/features/daily-challenge/components/daily-challenge-cta-panel';
import { getDailyLobbyView } from '@/features/daily-challenge/lib/get-daily-lobby-view';
import { resolveStreakGoal } from '@/features/daily-challenge/lib/resolve-streak-goal';
import { auth } from '@/lib/auth';
import type { Dictionary, Locale } from '@/shared/i18n';

type DailyChallengeCtaProps = {
    locale: Locale;
    dictionary: Dictionary;
    className?: string;
};

export async function DailyChallengeCta({
    locale,
    dictionary,
    className = '',
}: DailyChallengeCtaProps) {
    const session = await auth();
    const { status, boardEntries, showBoard, streak, standing } =
        await getDailyLobbyView(session?.user?.id ?? null);
    const you: DailyBoardYou | null =
        standing && status.kind === 'completed' && session?.user
            ? {
                  place: standing.place,
                  username: session.user.username,
                  score: status.score,
                  correctCount: status.correctCount,
                  totalQuestions: status.totalQuestions,
              }
            : null;

    return (
        <div className={className}>
            <div className="rounded-lg border border-l-4 border-border border-l-primary bg-surface p-4 shadow-sm sm:p-6">
                <DailyChallengeCtaPanel
                    locale={locale}
                    status={status}
                    streak={streak}
                    streakGoal={
                        streak ? resolveStreakGoal(streak, dictionary) : null
                    }
                    standing={standing}
                    dictionary={dictionary}
                    embedded
                />

                {showBoard ? (
                    <DailyChallengeBoard
                        entries={boardEntries}
                        currentUserId={standing ? (session?.user?.id ?? null) : null}
                        you={you}
                        labels={{
                            boardTitle: dictionary.dailyChallenge.boardTitle,
                            boardEmpty: dictionary.dailyChallenge.boardEmpty,
                            boardFull: dictionary.dailyChallenge.boardFull,
                            rank: dictionary.leaderboard.rank,
                            player: dictionary.leaderboard.player,
                            score: dictionary.leaderboard.score,
                            accuracy: dictionary.leaderboard.accuracy,
                        }}
                    />
                ) : null}
            </div>
        </div>
    );
}
