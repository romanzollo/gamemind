/**
 * Опрос состояния комнаты: `GET /api/room/{code}?locale=ru`.
 *
 * Клиент спрашивает по расписанию (раз в ~2 с в лобби, ~1,5 с пока открыт
 * приём ответов, на границах фаз). Ответ — то, что игроку уже можно знать
 * (`readRoomState`), плюс `serverNow` для поправки часов. Без кэша.
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import {
    readRoomRequest,
    roomError,
    roomFailure,
    roomJson,
    type RoomRequestContext,
} from '@/features/quiz-room/server/room-http';
import { readRoomState } from '@/features/quiz-room/server/room-service';
import { defaultLocale, isLocale } from '@/shared/i18n';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: RoomRequestContext) {
    const parsed = await readRoomRequest(context, 'roomPoll');

    if ('response' in parsed) {
        return parsed.response;
    }

    const localeParam = new URL(request.url).searchParams.get('locale');
    const locale = localeParam && isLocale(localeParam) ? localeParam : defaultLocale;

    try {
        const state = await readRoomState({
            code: parsed.code,
            userId: parsed.userId,
            locale,
        });

        return state ? roomJson(state) : roomError('NOT_FOUND');
    } catch (error) {
        return roomFailure(error, 'state');
    }
}
