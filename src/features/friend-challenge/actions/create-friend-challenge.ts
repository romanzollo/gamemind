'use server';

/**
 * Server Action: «Вызвать друга» на результате Классики.
 *
 * Игрок → своя сданная партия → вызов (или уже созданный из неё). Партию
 * и владельца проверяет сервер; клиент передаёт только sessionId. Список
 * вопросов берётся из лёгкого разбора партии, не из snapshot — это вне
 * горячего пути (кнопку нажимают после результата).
 * Canon: docs/DECISIONS.md → Friend challenge.
 */

import { friendChallengeRepository } from '@/entities/friend-challenge/friend-challenge.repository';
import { isChallengeableSession } from '@/features/friend-challenge/lib/challenge-rules';
import { requireUser } from '@/lib/auth/guards';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { isLocale } from '@/shared/i18n';

export type CreateFriendChallengeResult =
    | { ok: true; challengeId: string; creatorMarks: boolean[] }
    | { ok: false; errorCode: 'RATE_LIMITED' | 'NOT_ELIGIBLE' | 'FAILED' };

export async function createFriendChallengeAction(input: {
    sessionId: string;
    locale: string;
}): Promise<CreateFriendChallengeResult> {
    const locale = isLocale(input.locale) ? input.locale : 'ru';
    const session = await requireUser(locale);

    if (typeof input.sessionId !== 'string' || input.sessionId.length > 64) {
        return { ok: false, errorCode: 'NOT_ELIGIBLE' };
    }

    const rate = checkPresetRateLimit('quiz', getUserRateLimitIdentity(session.user.id));
    if (!rate.ok) {
        return { ok: false, errorCode: 'RATE_LIMITED' };
    }

    try {
        const created = await friendChallengeRepository.createFromSession({
            sessionId: input.sessionId,
            userId: session.user.id,
            isEligible: isChallengeableSession,
        });

        return created.ok
            ? { ok: true, challengeId: created.challengeId, creatorMarks: created.creatorMarks }
            : { ok: false, errorCode: 'NOT_ELIGIBLE' };
    } catch (error) {
        console.error('Friend challenge create failed:', error);
        captureAppError(error, {
            area: 'friend-challenge',
            extra: { stage: 'create', sessionId: input.sessionId },
        });
        return { ok: false, errorCode: 'FAILED' };
    }
}
