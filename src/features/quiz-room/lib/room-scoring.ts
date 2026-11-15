/**
 * Очки и таблица комнаты (чистые функции, без БД).
 *
 * Очки за ответ — как у Kahoot: верный ответ стоит 1000 × (1 − t / 2T),
 * то есть от 1000 (мгновенно) до 500 (в последнюю секунду); быстрее 0,5 с —
 * полные 1000. Неверный или пропущенный — 0. Без очков за скорость верный
 * ответ всегда 1000. Серия верных ответов показывается, но очков не даёт
 * (Kahoot убрал бонус за серию из-за жалоб на нечестность).
 *
 * Таблица считается только по раскрытым вопросам: пока идёт приём ответов,
 * места не меняются и не выдают, кто уже ответил верно.
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import {
    ROOM_FULL_POINTS_WINDOW_MS,
    ROOM_MAX_POINTS,
} from '@/features/quiz-room/lib/room-rules';

export type RoomAnswerScoreInput = {
    isCorrect: boolean;
    /** От открытия вариантов до прихода ответа на сервер. */
    elapsedMs: number;
    /** Длина окна ответа. */
    answerMs: number;
    speedScoring: boolean;
};

export function scoreRoomAnswer(input: RoomAnswerScoreInput): number {
    if (!input.isCorrect) {
        return 0;
    }

    if (!input.speedScoring || input.elapsedMs <= ROOM_FULL_POINTS_WINDOW_MS) {
        return ROOM_MAX_POINTS;
    }

    const elapsed = Math.min(Math.max(input.elapsedMs, 0), input.answerMs);

    return Math.round(ROOM_MAX_POINTS * (1 - elapsed / input.answerMs / 2));
}

export type RoomScoredAnswer = {
    playerId: string;
    position: number;
    isCorrect: boolean;
    points: number;
    elapsedMs: number;
};

export type RoomStanding = {
    playerId: string;
    score: number;
    correctCount: number;
    /** 1 — первое место; равные очки и время делят место (1, 1, 3). */
    rank: number;
    /** Место до последнего раскрытого вопроса; null — вопросов ещё не было. */
    previousRank: number | null;
    /** Очки за последний раскрытый вопрос (0 — мимо или нет ответа). */
    lastPoints: number;
    /** Верных подряд, считая с последнего раскрытого вопроса назад. */
    streak: number;
};

type Totals = {
    playerId: string;
    score: number;
    correctCount: number;
    /** Сумма времени верных ответов — разбивает ничью при равных очках. */
    correctElapsedMs: number;
};

function compareTotals(left: Totals, right: Totals): number {
    return (
        right.score - left.score ||
        right.correctCount - left.correctCount ||
        left.correctElapsedMs - right.correctElapsedMs
    );
}

function rankTotals(totals: Totals[]): Map<string, number> {
    const sorted = [...totals].sort(compareTotals);
    const ranks = new Map<string, number>();

    sorted.forEach((entry, index) => {
        const previous = sorted[index - 1];
        const shared =
            previous !== undefined && compareTotals(previous, entry) === 0;

        ranks.set(
            entry.playerId,
            shared ? ranks.get(previous.playerId)! : index + 1,
        );
    });

    return ranks;
}

function totalsUpTo(
    playerIds: readonly string[],
    answers: readonly RoomScoredAnswer[],
    revealedCount: number,
): Totals[] {
    const byPlayer = new Map<string, Totals>(
        playerIds.map((playerId) => [
            playerId,
            { playerId, score: 0, correctCount: 0, correctElapsedMs: 0 },
        ]),
    );

    for (const answer of answers) {
        const entry = byPlayer.get(answer.playerId);

        if (!entry || answer.position >= revealedCount) {
            continue;
        }

        entry.score += answer.points;

        if (answer.isCorrect) {
            entry.correctCount += 1;
            entry.correctElapsedMs += answer.elapsedMs;
        }
    }

    return [...byPlayer.values()];
}

/**
 * Таблица по первым `revealedCount` вопросам. Порядок результата — по месту
 * (при равенстве — как в `playerIds`).
 */
export function computeRoomStandings(
    playerIds: readonly string[],
    answers: readonly RoomScoredAnswer[],
    revealedCount: number,
): RoomStanding[] {
    const totals = totalsUpTo(playerIds, answers, revealedCount);
    const ranks = rankTotals(totals);
    const previousRanks =
        revealedCount > 1
            ? rankTotals(totalsUpTo(playerIds, answers, revealedCount - 1))
            : null;
    const lastPosition = revealedCount - 1;

    const standings = totals.map((entry): RoomStanding => {
        const own = answers.filter((answer) => answer.playerId === entry.playerId);
        const byPosition = new Map(own.map((answer) => [answer.position, answer]));
        let streak = 0;

        for (let position = lastPosition; position >= 0; position -= 1) {
            if (!byPosition.get(position)?.isCorrect) {
                break;
            }
            streak += 1;
        }

        return {
            playerId: entry.playerId,
            score: entry.score,
            correctCount: entry.correctCount,
            rank: ranks.get(entry.playerId)!,
            previousRank: previousRanks?.get(entry.playerId) ?? null,
            lastPoints:
                lastPosition >= 0 ? (byPosition.get(lastPosition)?.points ?? 0) : 0,
            streak,
        };
    });

    const order = new Map(playerIds.map((playerId, index) => [playerId, index]));

    return standings.sort(
        (left, right) =>
            left.rank - right.rank ||
            order.get(left.playerId)! - order.get(right.playerId)!,
    );
}
