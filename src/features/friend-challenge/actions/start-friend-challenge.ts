'use server';

/**
 * Server Action: «Принять вызов» — попытка друга на тех же вопросах.
 *
 * Путь как у Челленджа дня: вызов по PK → уже есть попытка? (resume /
 * результат) → вопросы по замороженным id → snapshot (варианты
 * перемешаны заново, порядок вопросов — как у автора) → create с
 * `friendChallengeId`. Мешок анти-повтора не трогаем: набор чужой.
 * Сдача, часы и разбор — обычные, как у Классики.
 * Canon: docs/DECISIONS.md → Friend challenge.
 */

import { redirect } from 'next/navigation';

import {
    friendChallengeRepository,
    isFriendChallengeId,
    type ChallengeAttempt,
} from '@/entities/friend-challenge/friend-challenge.repository';
import { questionRepository } from '@/entities/question/question.repository';
import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import type {
    FriendChallengeErrorCode,
    FriendChallengeStartState,
} from '@/features/friend-challenge/types';
import { buildQuizSnapshotQuestions } from '@/features/quiz/lib/build-quiz-snapshot-questions';
import {
    captureQuizStartError,
    mapQuizStartError,
} from '@/features/quiz/lib/map-quiz-start-error';
import { requireUser } from '@/lib/auth/guards';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

/** Пауза после чтения вызова перед resolve — как Daily / Classic settle. */
const START_SETTLE_MS = 500;

type StartOutcome =
    | { kind: 'created'; sessionId: string }
    | { kind: 'attempt'; attempt: ChallengeAttempt }
    | { kind: 'error'; errorCode: FriendChallengeErrorCode };

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale) ? locale : defaultLocale;
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
    );
}

async function startAttempt(
    challengeId: string,
    userId: string,
    locale: Locale,
): Promise<StartOutcome> {
    const found = await friendChallengeRepository.findForStart(challengeId, userId);

    if (!found) {
        return { kind: 'error', errorCode: 'CHALLENGE_EXPIRED' };
    }

    const { challenge, attempt } = found;

    if (challenge.creatorUserId === userId) {
        return { kind: 'error', errorCode: 'CHALLENGE_OWN' };
    }

    if (attempt) {
        return { kind: 'attempt', attempt };
    }

    await new Promise((resolve) => setTimeout(resolve, START_SETTLE_MS));

    const pickedQuestions = await questionRepository.pickSnapshotBundleByQuestionIds(
        challenge.questionIds,
        locale,
    );

    // Вопрос удалили после создания вызова — тот же набор уже не собрать.
    if (pickedQuestions.length !== challenge.questionCount) {
        return { kind: 'error', errorCode: 'CHALLENGE_EXPIRED' };
    }

    const created = await quizSessionRepository.createWithJsonSnapshot({
        userId,
        difficulty: challenge.poolKind === 'MIXED' ? null : challenge.difficulty,
        poolKind: challenge.poolKind,
        questionCount: challenge.questionCount,
        sessionLocale: locale,
        friendChallengeId: challenge.id,
        // Порядок автора уже прошёл расстановку аудио — повторная его не меняет.
        questions: buildQuizSnapshotQuestions(pickedQuestions),
        pickedQuestions,
    });

    return { kind: 'created', sessionId: created.id };
}

export async function startFriendChallengeAction(
    _prevState: FriendChallengeStartState,
    formData: FormData,
): Promise<FriendChallengeStartState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireUser(locale);
    const challengeId = formData.get('challengeId');

    if (typeof challengeId !== 'string' || !isFriendChallengeId(challengeId)) {
        return { errorCode: 'CHALLENGE_EXPIRED' };
    }

    const rate = checkPresetRateLimit('quiz', getUserRateLimitIdentity(session.user.id));
    if (!rate.ok) {
        return { errorCode: 'RATE_LIMITED' };
    }

    let outcome: StartOutcome;

    try {
        outcome = await startAttempt(challengeId, session.user.id, locale);
    } catch (error) {
        // Двойное нажатие: попытка уже создана параллельным запросом.
        const raced = isUniqueViolation(error)
            ? await friendChallengeRepository
                  .findForStart(challengeId, session.user.id)
                  .catch(() => null)
            : null;

        if (raced?.attempt) {
            outcome = { kind: 'attempt', attempt: raced.attempt };
        } else {
            const errorCode = mapQuizStartError(error);
            console.error('Friend challenge start failed:', errorCode, error);
            captureQuizStartError(error, errorCode, 'friend-challenge');
            return { errorCode };
        }
    }

    // redirect() бросает NEXT_REDIRECT — поэтому вне try.
    if (outcome.kind === 'created') {
        redirect(`/${locale}/quiz/${outcome.sessionId}?f=${Date.now()}`);
    }

    if (outcome.kind === 'attempt') {
        if (outcome.attempt.status === 'IN_PROGRESS') {
            redirect(`/${locale}/quiz/${outcome.attempt.sessionId}?f=${Date.now()}`);
        }
        if (outcome.attempt.status === 'COMPLETED') {
            redirect(`/${locale}/result/${outcome.attempt.sessionId}`);
        }
        return { errorCode: 'CHALLENGE_USED' };
    }

    return { errorCode: outcome.errorCode };
}
