/**
 * Строки итогов сыгранной комнаты (`RoomResult`) — чистая функция.
 *
 * Одна для живой записи (первый опрос после конца игры) и для досчёта уже
 * сыгранных комнат (scripts/backfill-room-results.ts): место и очки — как в
 * финальной таблице (`computeRoomStandings`), награды — `computeRoomAwards`.
 *
 * Canon: docs/DECISIONS.md → Quiz room (v3, рейтинг комнат).
 */

import { computeRoomAwards } from '@/features/quiz-room/lib/room-awards';
import {
    computeRoomStandings,
    type RoomScoredAnswer,
} from '@/features/quiz-room/lib/room-scoring';

export type RoomResultRow = {
    playerId: string;
    userId: string;
    rank: number;
    score: number;
    correctCount: number;
    playersCount: number;
    questionCount: number;
    awards: string[];
};

export function buildRoomResultRows(input: {
    players: ReadonlyArray<{ id: string; userId: string }>;
    answers: readonly RoomScoredAnswer[];
    questionCount: number;
    answerMs: number;
}): RoomResultRow[] {
    const playerIds = input.players.map((player) => player.id);
    const standings = computeRoomStandings(playerIds, input.answers, input.questionCount);
    const awards = computeRoomAwards(playerIds, input.answers, input.questionCount, input.answerMs);
    const userOf = new Map(input.players.map((player) => [player.id, player.userId]));

    return standings.map((row) => ({
        playerId: row.playerId,
        userId: userOf.get(row.playerId)!,
        rank: row.rank,
        score: row.score,
        correctCount: row.correctCount,
        playersCount: playerIds.length,
        questionCount: input.questionCount,
        awards: awards.filter((award) => award.playerId === row.playerId).map((award) => award.kind),
    }));
}
