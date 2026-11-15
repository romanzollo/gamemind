/**
 * Когда телефону снова спросить состояние комнаты (чистая функция).
 *
 * Расписание известно заранее, поэтому опрос идёт не «каждую секунду», а
 * по делу: на границе фазы (+120 мс, чтобы сервер точно её перешёл), чаще —
 * пока открыт приём ответов (счётчик «ответили N из M» и досрочное
 * закрытие), и сразу же, если на руках не хватает данных фазы (вопрос,
 * варианты, разбор). null — опрашивать больше не нужно.
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { getRoomPhase } from '@/features/quiz-room/lib/room-schedule';
import type { RoomStateDto } from '@/features/quiz-room/types';

export const ROOM_POLL = {
    lobbyMs: 1_500,
    startingMs: 800,
    answerMs: 1_500,
    idleMaxMs: 2_000,
    finishedMs: 3_000,
    missingDataMs: 300,
    boundaryLeadMs: 120,
    minMs: 100,
} as const;

function untilBoundary(boundary: number, now: number, cap: number): number {
    return Math.min(cap, Math.max(ROOM_POLL.minMs, boundary - now + ROOM_POLL.boundaryLeadMs));
}

export function nextRoomPollDelay(state: RoomStateDto, now: number): number | null {
    switch (state.status) {
        case 'closed':
            return null;
        case 'lobby':
            return ROOM_POLL.lobbyMs;
        case 'starting':
            return ROOM_POLL.startingMs;
        case 'finished':
            // Ждём, не откроет ли ведущий «Ещё раунд».
            return state.nextRoomCode ? null : ROOM_POLL.finishedMs;
        case 'playing':
            break;
    }

    const phase = getRoomPhase(state.schedule, now);
    const current = state.current;

    switch (phase.kind) {
        case 'countdown':
            return untilBoundary(phase.endsAt, now, ROOM_POLL.idleMaxMs);
        case 'intro':
            if (current?.position !== phase.position) return ROOM_POLL.missingDataMs;
            return untilBoundary(phase.endsAt, now, ROOM_POLL.idleMaxMs);
        case 'answer':
            if (current?.position !== phase.position || !current.options) {
                return ROOM_POLL.missingDataMs;
            }
            return untilBoundary(phase.endsAt, now, ROOM_POLL.answerMs);
        case 'reveal':
            if (current?.position !== phase.position || !current.reveal) {
                return ROOM_POLL.missingDataMs;
            }
            return untilBoundary(phase.endsAt, now, ROOM_POLL.idleMaxMs);
        case 'finished':
            // Сервер переведёт комнату в FINISHED на ближайшем опросе.
            return ROOM_POLL.missingDataMs;
    }
}
