/**
 * Награды раунда и цель «до места» (чистые функции, без БД).
 *
 * Награды дают титул не только победителю — повод остаться на ещё раунд:
 * - «Самый быстрый» — меньшее среднее время верного ответа;
 * - «Снайпер» — больше всех верных (при равенстве — выше в таблице);
 * - «Рывок» — сильнее всех поднялся с места после первого вопроса до финала.
 * У игрока не больше одной награды (иначе сильнейший забирает все три, и
 * титулы теряют смысл): каждая следующая достаётся лучшему из ещё не
 * награждённых. Нет достойного (ни одного верного, никто не поднялся) —
 * награду не выдаём. Цель «до места» — сколько очков до ближайшего выше.
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import {
    computeRoomStandings,
    type RoomScoredAnswer,
    type RoomStanding,
} from '@/features/quiz-room/lib/room-scoring';

export type RoomAward =
    | { kind: 'fastest'; playerId: string; averageMs: number }
    | { kind: 'sniper'; playerId: string; correct: number }
    | { kind: 'climb'; playerId: string; places: number };

export function computeRoomAwards(
    playerIds: readonly string[],
    answers: readonly RoomScoredAnswer[],
    questionCount: number,
): RoomAward[] {
    if (playerIds.length < 2 || questionCount === 0) {
        return [];
    }

    const final = computeRoomStandings(playerIds, answers, questionCount);
    const order = new Map(final.map((row, index) => [row.playerId, index]));
    const awards: RoomAward[] = [];
    const awarded = new Set<string>();

    const fastest = playerIds
        .flatMap((playerId) => {
            const correct = answers.filter(
                (answer) =>
                    answer.playerId === playerId &&
                    answer.isCorrect &&
                    answer.position < questionCount,
            );

            return correct.length > 0
                ? [{
                      playerId,
                      averageMs:
                          correct.reduce((sum, answer) => sum + Math.max(0, answer.elapsedMs), 0) /
                          correct.length,
                  }]
                : [];
        })
        .sort((left, right) => left.averageMs - right.averageMs)[0];

    if (fastest) {
        awards.push({ kind: 'fastest', ...fastest });
        awarded.add(fastest.playerId);
    }

    const sniper = final
        .filter((row) => row.correctCount > 0 && !awarded.has(row.playerId))
        .sort(
            (left, right) =>
                right.correctCount - left.correctCount ||
                order.get(left.playerId)! - order.get(right.playerId)!,
        )[0];

    if (sniper) {
        awards.push({ kind: 'sniper', playerId: sniper.playerId, correct: sniper.correctCount });
        awarded.add(sniper.playerId);
    }

    if (questionCount >= 2) {
        const afterFirst = new Map(
            computeRoomStandings(playerIds, answers, 1).map((row) => [row.playerId, row.rank]),
        );
        const climb = final
            .map((row) => ({
                playerId: row.playerId,
                places: (afterFirst.get(row.playerId) ?? row.rank) - row.rank,
            }))
            .filter((row) => row.places > 0 && !awarded.has(row.playerId))
            .sort(
                (left, right) =>
                    right.places - left.places ||
                    order.get(left.playerId)! - order.get(right.playerId)!,
            )[0];

        if (climb) {
            awards.push({ kind: 'climb', ...climb });
        }
    }

    return awards;
}

export type RoomGoal =
    | { kind: 'lead'; ahead: number }
    | { kind: 'chase'; targetRank: number; behind: number }
    | null;

/**
 * Цель на следующий вопрос: лидеру — отрыв от второго, остальным — сколько
 * очков до ближайшего игрока выше. null — один в комнате или нет очков ни у
 * кого (в начале игры плашка не нужна).
 */
export function getRoomGoal(standings: readonly RoomStanding[], playerId: string): RoomGoal {
    const me = standings.find((row) => row.playerId === playerId);

    if (!me || standings.length < 2 || standings.every((row) => row.score === 0)) {
        return null;
    }

    const above = standings
        .filter((row) => row.score > me.score)
        .sort((left, right) => left.score - right.score)[0];

    if (!above) {
        const next = standings
            .filter((row) => row.playerId !== playerId)
            .sort((left, right) => right.score - left.score)[0];

        return next ? { kind: 'lead', ahead: me.score - next.score } : null;
    }

    return { kind: 'chase', targetRank: above.rank, behind: above.score - me.score };
}
