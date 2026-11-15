/**
 * Общее для Route Handlers комнаты: код ошибки → HTTP-статус, разбор кода
 * из адреса, игрок из JWT (без чтения строки User — лишний hop на каждый
 * опрос), лимит частоты и перевод сбоя Neon в «повтори».
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { NextResponse } from 'next/server';

import { normalizeRoomCode } from '@/features/quiz-room/lib/room-code';
import type { RoomErrorCode } from '@/features/quiz-room/types';
import { auth } from '@/lib/auth';
import { DirectPgTimeoutError, isTransientDirectPgError } from '@/lib/db/direct-pg';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { checkPresetRateLimit, type RateLimitPresetName } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';

const ERROR_STATUS: Record<RoomErrorCode, number> = {
    NOT_FOUND: 404,
    CLOSED: 409,
    STARTED: 409,
    FULL: 409,
    KICKED: 403,
    NOT_HOST: 403,
    NOT_MEMBER: 403,
    NOT_ENOUGH_PLAYERS: 409,
    NOT_ENOUGH_QUESTIONS: 409,
    INVALID: 400,
    GUEST_HOST: 403,
    RATE_LIMITED: 429,
    TIME_UP: 409,
    RETRY: 503,
};

const NO_STORE = { 'Cache-Control': 'no-store' };

export function roomError(errorCode: RoomErrorCode): NextResponse {
    return NextResponse.json(
        { error: errorCode },
        { status: ERROR_STATUS[errorCode], headers: NO_STORE },
    );
}

export function roomJson(body: unknown): NextResponse {
    return NextResponse.json(body, { headers: NO_STORE });
}

export type RoomRequestContext = {
    params: Promise<{ code: string }>;
};

/** Код из адреса + игрок из JWT + лимит. Ошибка — готовый ответ. */
export async function readRoomRequest(
    context: RoomRequestContext,
    preset: RateLimitPresetName,
): Promise<{ code: string; userId: string } | { response: NextResponse }> {
    const { code: rawCode } = await context.params;
    const code = normalizeRoomCode(rawCode);

    if (!code) {
        return { response: roomError('NOT_FOUND') };
    }

    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        return {
            response: NextResponse.json(
                { error: 'UNAUTHORIZED' },
                { status: 401, headers: NO_STORE },
            ),
        };
    }

    if (!checkPresetRateLimit(preset, getUserRateLimitIdentity(userId)).ok) {
        return { response: roomError('RATE_LIMITED') };
    }

    return { code, userId };
}

/** Сбой Neon — «повтори» (клиент повторит сам); остальное — ещё и в Sentry. */
export function roomFailure(error: unknown, operation: string): NextResponse {
    if (error instanceof DirectPgTimeoutError || isTransientDirectPgError(error)) {
        console.warn(
            `Room ${operation} retryable failure:`,
            error instanceof Error ? error.message : error,
        );
    } else {
        console.error(`Room ${operation} failed:`, error);
        captureAppError(error, { area: 'quiz-room', extra: { operation } });
    }

    return roomError('RETRY');
}
