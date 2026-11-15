'use server';

/**
 * Server Actions комнаты: создать (ведущий) и войти (игрок).
 * Дальше всё живёт в клиенте комнаты и `/api/room/*`.
 *
 * Создавать может только аккаунт (гость — только входить), как Блиц и
 * Выживание. Имя проверяет сервер; занятое — получает номер («Имя 2»).
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { redirect } from 'next/navigation';

import { normalizeRoomCode } from '@/features/quiz-room/lib/room-code';
import {
    nicknameFromUsername,
    normalizeRoomNickname,
} from '@/features/quiz-room/lib/room-nickname';
import { createRoom, joinRoom } from '@/features/quiz-room/server/room-service';
import type { RoomFormState } from '@/features/quiz-room/types';
import { requireUser } from '@/lib/auth/guards';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

function readLocale(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale) ? locale : defaultLocale;
}

export async function createRoomAction(
    _prevState: RoomFormState,
    formData: FormData,
): Promise<RoomFormState> {
    const locale = readLocale(formData);
    const session = await requireUser(locale);

    if (session.user.isGuest) {
        return { errorCode: 'GUEST_HOST' };
    }

    if (!checkPresetRateLimit('quiz', getUserRateLimitIdentity(session.user.id)).ok) {
        return { errorCode: 'RATE_LIMITED' };
    }

    let code: string | null;

    try {
        code = await createRoom({
            hostUserId: session.user.id,
            nickname: nicknameFromUsername(session.user.username),
        });
    } catch (error) {
        captureAppError(error, { area: 'quiz-room', extra: { operation: 'create' } });
        return { errorCode: 'RETRY' };
    }

    if (!code) {
        return { errorCode: 'RETRY' };
    }

    redirect(`/${locale}/room/${code}`);
}

export async function joinRoomAction(
    _prevState: RoomFormState,
    formData: FormData,
): Promise<RoomFormState> {
    const locale = readLocale(formData);
    const session = await requireUser(locale);
    const code = normalizeRoomCode(formData.get('code'));

    if (!code) {
        return { errorCode: 'NOT_FOUND' };
    }

    const nickname =
        normalizeRoomNickname(formData.get('nickname')) ??
        (formData.get('nickname') ? null : nicknameFromUsername(session.user.username));

    if (!nickname) {
        return { errorCode: 'INVALID' };
    }

    if (!checkPresetRateLimit('roomAction', getUserRateLimitIdentity(session.user.id)).ok) {
        return { errorCode: 'RATE_LIMITED' };
    }

    let result: Awaited<ReturnType<typeof joinRoom>>;

    try {
        result = await joinRoom({ code, userId: session.user.id, nickname });
    } catch (error) {
        captureAppError(error, { area: 'quiz-room', extra: { operation: 'join' } });
        return { errorCode: 'RETRY' };
    }

    if (!result.ok) {
        return { errorCode: result.errorCode };
    }

    redirect(`/${locale}/room/${code}`);
}
