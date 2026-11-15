/**
 * Действия ведущего: `POST /api/room/{code}/host`.
 *
 * `{ op: 'settings', settings }` — настройки в лобби;
 * `{ op: 'start' }` — начать (вопросы собираются на сервере);
 * `{ op: 'kick', playerId }` — убрать игрока из лобби;
 * `{ op: 'rematch' }` — «Ещё раунд» после финала (отдаёт код новой комнаты).
 * Права проверяет сервис: ведущий — `Room.hostUserId` из БД, не из запроса.
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { z } from 'zod';

import {
    readRoomRequest,
    roomError,
    roomFailure,
    roomJson,
    type RoomRequestContext,
} from '@/features/quiz-room/server/room-http';
import {
    kickRoomPlayer,
    rematchRoom,
    startRoom,
    updateRoomSettings,
    type HostActionResult,
} from '@/features/quiz-room/server/room-service';

const hostBodySchema = z.discriminatedUnion('op', [
    z.object({ op: z.literal('settings'), settings: z.unknown() }),
    z.object({ op: z.literal('start') }),
    z.object({ op: z.literal('kick'), playerId: z.string().min(1).max(64) }),
    z.object({ op: z.literal('rematch') }),
]);

export async function POST(request: Request, context: RoomRequestContext) {
    const parsed = await readRoomRequest(context, 'roomAction');

    if ('response' in parsed) {
        return parsed.response;
    }

    const body = hostBodySchema.safeParse(await request.json().catch(() => null));

    if (!body.success) {
        return roomError('INVALID');
    }

    const { code, userId } = parsed;

    try {
        let result: HostActionResult;

        switch (body.data.op) {
            case 'settings':
                result = await updateRoomSettings({ code, userId, settings: body.data.settings });
                break;
            case 'start':
                result = await startRoom({ code, userId });
                break;
            case 'kick':
                result = await kickRoomPlayer({ code, userId, playerId: body.data.playerId });
                break;
            case 'rematch':
                result = await rematchRoom({ code, userId });
                break;
        }

        return result.ok
            ? roomJson({ ok: true, nextRoomCode: result.nextRoomCode ?? null })
            : roomError(result.errorCode);
    } catch (error) {
        return roomFailure(error, `host.${body.data.op}`);
    }
}
