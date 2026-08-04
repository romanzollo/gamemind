/**
 * Mode lobby `/quiz`: статус Daily + board за минимум Direct TLS.
 *
 * Happy path (день уже есть): один `findLobbyPanelState`.
 * Первый игрок дня: ensure (write) → повторный panel read.
 * Гость без дня: без INSERT, CTA login.
 */

import { dailyChallengeRepository } from '@/entities/daily-challenge/daily-challenge.repository';
import { ensureDailyChallenge } from '@/features/daily-challenge/lib/ensure-daily-challenge';
import { getMoscowDateKey } from '@/features/daily-challenge/lib/get-moscow-date-key';
import type { DailyChallengePlayerStatus } from '@/features/daily-challenge/types';
import { mapLeaderboardEntries } from '@/features/leaderboard/lib/map-leaderboard-entries';

const DAILY_BOARD_LIMIT = 10;

export type DailyLobbyView = {
    status: DailyChallengePlayerStatus;
    boardEntries: ReturnType<typeof mapLeaderboardEntries>;
    showBoard: boolean;
};

function statusFromAttempt(
    challengeDate: string,
    attempt: Awaited<
        ReturnType<typeof dailyChallengeRepository.findAttemptByUserAndChallenge>
    >,
): DailyChallengePlayerStatus {
    if (!attempt) {
        return {
            kind: 'available',
            challengeDate,
        };
    }

    if (attempt.kind === 'in_progress') {
        return {
            kind: 'in_progress',
            challengeDate,
            sessionId: attempt.sessionId,
        };
    }

    if (attempt.kind === 'completed') {
        return {
            kind: 'completed',
            challengeDate,
            sessionId: attempt.sessionId,
            score: attempt.score,
            totalQuestions: attempt.totalQuestions,
            correctCount: attempt.correctCount,
        };
    }

    return {
        kind: 'unavailable',
        reason: 'attempt_abandoned',
    };
}

export async function getDailyLobbyView(
    userId: string | null,
    now: Date = new Date(),
): Promise<DailyLobbyView> {
    const challengeDate = getMoscowDateKey(now);

    if (!userId) {
        const panel = await dailyChallengeRepository.findLobbyPanelState({
            challengeDate,
            userId: null,
            boardLimit: DAILY_BOARD_LIMIT,
        });

        return {
            status: {
                kind: 'unavailable',
                reason: 'not_authenticated',
            },
            boardEntries: mapLeaderboardEntries(panel.boardEntries),
            showBoard: panel.challenge !== null,
        };
    }

    let panel = await dailyChallengeRepository.findLobbyPanelState({
        challengeDate,
        userId,
        boardLimit: DAILY_BOARD_LIMIT,
    });

    if (!panel.challenge) {
        const ensured = await ensureDailyChallenge(now);

        if (!ensured.ok) {
            return {
                status: {
                    kind: 'unavailable',
                    reason: 'insufficient_pool',
                },
                boardEntries: [],
                showBoard: false,
            };
        }

        panel = await dailyChallengeRepository.findLobbyPanelState({
            challengeDate,
            userId,
            boardLimit: DAILY_BOARD_LIMIT,
        });
    }

    if (!panel.challenge) {
        return {
            status: {
                kind: 'unavailable',
                reason: 'insufficient_pool',
            },
            boardEntries: [],
            showBoard: false,
        };
    }

    return {
        status: statusFromAttempt(panel.challenge.challengeDate, panel.attempt),
        boardEntries: mapLeaderboardEntries(panel.boardEntries),
        showBoard: true,
    };
}
