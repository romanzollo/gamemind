/**
 * Ответ игрока комнаты: `POST /api/room/{code}/answer { position, option }`.
 *
 * Время ответа — момент прихода запроса (берётся до auth, canon E). Ответ
 * сервера — «принят» / «повтор», без «верно / неверно»: верный вариант все
 * узнают вместе, когда приём закроется. Первый ответ побеждает.
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { z } from 'zod';

import { ROOM_QUESTION_COUNTS } from '@/features/quiz-room/lib/room-rules';
import {
    readRoomRequest,
    roomError,
    roomFailure,
    roomJson,
    type RoomRequestContext,
} from '@/features/quiz-room/server/room-http';
import { submitRoomAnswer } from '@/features/quiz-room/server/room-service';

const answerBodySchema = z.object({
    position: z
        .number()
        .int()
        .min(0)
        .max(Math.max(...ROOM_QUESTION_COUNTS) - 1),
    option: z.string().min(1).max(16),
});

export async function POST(request: Request, context: RoomRequestContext) {
    const receivedAt = new Date();
    const parsed = await readRoomRequest(context, 'quizAnswer');

    if ('response' in parsed) {
        return parsed.response;
    }

    const body = answerBodySchema.safeParse(await request.json().catch(() => null));

    if (!body.success) {
        return roomError('INVALID');
    }

    try {
        const result = await submitRoomAnswer({
            code: parsed.code,
            userId: parsed.userId,
            position: body.data.position,
            optionKey: body.data.option,
            receivedAt,
        });

        return result.status === 'error'
            ? roomError(result.errorCode)
            : roomJson({ accepted: true, replay: result.status === 'replay' });
    } catch (error) {
        return roomFailure(error, 'answer');
    }
}
