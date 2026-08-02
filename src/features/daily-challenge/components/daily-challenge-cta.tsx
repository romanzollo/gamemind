/**
 * Server CTA Daily Challenge: auth (optional) → статус → панель + рейтинг дня.
 *
 * Живёт на mode lobby `/quiz` (не на Home — anti-duplication IA).
 * Рейтинг: только если строка DailyChallenge на сегодня уже есть
 * (после ensure у залогиненного или если кто-то уже стартовал).
 * Гость без созданного дня — CTA login, без лишнего INSERT.
 */

import { DailyChallengeBoard } from '@/features/daily-challenge/components/daily-challenge-board';
import { DailyChallengeCtaPanel } from '@/features/daily-challenge/components/daily-challenge-cta-panel';
import { dailyChallengeRepository } from '@/entities/daily-challenge/daily-challenge.repository';
import { getDailyChallengePlayerStatus } from '@/features/daily-challenge/lib/get-daily-challenge-player-status';
import { getMoscowDateKey } from '@/features/daily-challenge/lib/get-moscow-date-key';
import { mapLeaderboardEntries } from '@/features/leaderboard/lib/map-leaderboard-entries';
import { auth } from '@/lib/auth';
import type { Dictionary, Locale } from '@/shared/i18n';

const DAILY_BOARD_LIMIT = 10;

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
    const status = await getDailyChallengePlayerStatus(
        session?.user?.id ?? null,
    );

    const challenge = await dailyChallengeRepository.findByChallengeDate(
        getMoscowDateKey(),
    );

    let boardEntries: ReturnType<typeof mapLeaderboardEntries> = [];

    if (challenge) {
        try {
            const rows =
                await dailyChallengeRepository.findScoresByChallengeId(
                    challenge.id,
                    DAILY_BOARD_LIMIT,
                );
            boardEntries = mapLeaderboardEntries(rows);
        } catch (error) {
            console.error('[daily-challenge] board load failed:', error);
            boardEntries = [];
        }
    }

    const showBoard = challenge !== null;

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
