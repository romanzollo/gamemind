/**
 * Действия игрока о себе: `POST /api/room/{code}/me`.
 *
 * `{ op: 'nickname', nickname }` — сменить имя в лобби;
 * `{ op: 'leave' }` — выйти из лобби (ведущий — комната закрывается).
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
import { leaveRoom, renameRoomPlayer } from '@/features/quiz-room/server/room-service';

const meBodySchema = z.discriminatedUnion('op', [
    z.object({ op: z.literal('nickname'), nickname: z.string().max(64) }),
    z.object({ op: z.literal('leave') }),
]);

export async function POST(request: Request, context: RoomRequestContext) {
    const parsed = await readRoomRequest(context, 'roomAction');

    if ('response' in parsed) {
        return parsed.response;
    }

    const body = meBodySchema.safeParse(await request.json().catch(() => null));

    if (!body.success) {
        return roomError('INVALID');
    }

    try {
        const result =
            body.data.op === 'nickname'
                ? await renameRoomPlayer({
                      code: parsed.code,
                      userId: parsed.userId,
                      nickname: body.data.nickname,
                  })
                : await leaveRoom({ code: parsed.code, userId: parsed.userId });

        return result.ok ? roomJson({ ok: true }) : roomError(result.errorCode);
    } catch (error) {
        return roomFailure(error, `me.${body.data.op}`);
    }
}
