/**
 * Разбор для итогов комнаты: `GET /api/room/{code}/review?locale=ru`.
 *
 * Вопросы, где игрок ошибся или не успел, с верным ответом. Только после
 * конца игры и только участнику (до финала верные ответы закрыты).
 * Читается один раз по кнопке в итогах, не в опросе.
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import {
    readRoomRequest,
    roomFailure,
    roomJson,
    type RoomRequestContext,
} from '@/features/quiz-room/server/room-http';
import { readRoomReview } from '@/features/quiz-room/server/room-service';
import { defaultLocale, isLocale } from '@/shared/i18n';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: RoomRequestContext) {
    const parsed = await readRoomRequest(context, 'roomAction');

    if ('response' in parsed) {
        return parsed.response;
    }

    const localeParam = new URL(request.url).searchParams.get('locale');
    const locale = localeParam && isLocale(localeParam) ? localeParam : defaultLocale;

    try {
        const items = await readRoomReview({ code: parsed.code, userId: parsed.userId, locale });

        return roomJson({ items });
    } catch (error) {
        return roomFailure(error, 'review');
    }
}
