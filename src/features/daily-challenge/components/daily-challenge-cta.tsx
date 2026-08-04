/**
 * Server CTA Daily Challenge: auth (optional) → статус → панель + рейтинг дня.
 *
 * Живёт на mode lobby `/quiz` (не на Home — anti-duplication IA).
 * Чтение через `getDailyLobbyView` (один Direct TLS на happy path).
 */

import { DailyChallengeBoard } from '@/features/daily-challenge/components/daily-challenge-board';
import { DailyChallengeCtaPanel } from '@/features/daily-challenge/components/daily-challenge-cta-panel';
import { getDailyLobbyView } from '@/features/daily-challenge/lib/get-daily-lobby-view';
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
    const { status, boardEntries, showBoard } = await getDailyLobbyView(
        session?.user?.id ?? null,
    );

    return (
        <div className={className}>
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5">
                <DailyChallengeCtaPanel
                    locale={locale}
                    status={status}
                    dictionary={dictionary}
                    embedded
                />

                {showBoard ? (
                    <DailyChallengeBoard
                        entries={boardEntries}
                        labels={{
                            boardTitle: dictionary.dailyChallenge.boardTitle,
                            boardEmpty: dictionary.dailyChallenge.boardEmpty,
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
