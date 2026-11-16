/**
 * Таблица компании и счёт встреч для итогов комнаты:
 * `GET /api/room/{code}/league`.
 *
 * Только после конца игры и только участнику. «Компания» — игроки этой
 * комнаты; считаются все сыгранные комнаты, где было хотя бы двое из них.
 * Читается один раз на экране итогов, не в опросе.
 * Canon: docs/DECISIONS.md → Quiz room (v3, рейтинг комнат).
 */

import {
    readRoomRequest,
    roomError,
    roomFailure,
    roomJson,
    type RoomRequestContext,
} from '@/features/quiz-room/server/room-http';
import { readRoomLeague } from '@/features/quiz-room/server/room-service';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: RoomRequestContext) {
    const parsed = await readRoomRequest(context, 'roomAction');

    if ('response' in parsed) {
        return parsed.response;
    }

    try {
        const league = await readRoomLeague({ code: parsed.code, userId: parsed.userId });

        return league ? roomJson(league) : roomError('NOT_MEMBER');
    } catch (error) {
        return roomFailure(error, 'league');
    }
}
