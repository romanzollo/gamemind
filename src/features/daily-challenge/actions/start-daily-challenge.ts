'use server';

/**
 * Server Action: старт / resume Daily Challenge.
 *
 * Поток:
 * 1) auth + rate limit (тот же preset `quiz`, что classic start);
 * 2) ensureDailyChallenge (freeze дня);
 * 3) если попытка уже есть → redirect quiz/result;
 * 4) иначе bundle по frozen ids → JSON snapshot + dailyChallengeId.
 *
 * Scoring / submit не меняем — дальше обычный quiz page + submitQuizAction.
 * Canon: DECISIONS.md → Daily Challenge MVP.
 */

import { redirect } from 'next/navigation';

import { dailyChallengeRepository } from '@/entities/daily-challenge/daily-challenge.repository';
import { questionRepository } from '@/entities/question/question.repository';
import {
    quizSessionRepository,
    QuizSessionStartError,
} from '@/entities/quiz-session/quiz-session.repository';
import { ensureDailyChallenge } from '@/features/daily-challenge/lib/ensure-daily-challenge';
import type { QuizFormState } from '@/features/quiz/types';
import { requireUser } from '@/lib/auth/guards';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';
import { shuffleArray } from '@/shared/utils';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
    );
}

function redirectExistingAttempt(
    locale: Locale,
    attempt: {
        kind: string;
        sessionId: string;
    },
): never {
    if (attempt.kind === 'completed') {
        redirect(`/${locale}/result/${attempt.sessionId}`);
    }

    redirect(`/${locale}/quiz/${attempt.sessionId}`);
}

/**
 * Старт daily. FormData: только `locale` (сложность/count — из MVP rules + freeze).
 */
export async function startDailyChallengeAction(
    _prevState: QuizFormState,
    formData: FormData,
): Promise<QuizFormState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireUser(locale);

    const rate = checkPresetRateLimit(
        'quiz',
        getUserRateLimitIdentity(session.user.id),
    );
    if (!rate.ok) {
        return { errorCode: 'RATE_LIMITED' };
    }

    const ensured = await ensureDailyChallenge();

    if (!ensured.ok) {
        return { errorCode: 'NOT_ENOUGH_QUESTIONS' };
    }

    const { challenge } = ensured;

    const existingAttempt =
        await dailyChallengeRepository.findAttemptByUserAndChallenge(
            session.user.id,
            challenge.id,
        );

    if (existingAttempt) {
        redirectExistingAttempt(locale, existingAttempt);
    }

    const pickedQuestions =
        await questionRepository.pickSnapshotBundleByQuestionIds(
            challenge.questionIds,
            locale,
        );

    if (pickedQuestions.length !== challenge.questionCount) {
        return { errorCode: 'NOT_ENOUGH_QUESTIONS' };
    }

    // Порядок вопросов = freeze; порядок вариантов — per-session shuffle (anti-cheat).
    const snapshotQuestions = pickedQuestions.map((question, index) => {
        const shuffledOptions = shuffleArray(question.options);

        return {
            questionId: question.id,
            position: index,
            displayText: question.displayText,
            displayTexts: question.displayTexts,
            displayImageUrl: normalizeQuizImageUrl(question.displayImageUrl),
            options: shuffledOptions.map((option, optionIndex) => ({
                optionId: option.id,
                displayOrder: optionIndex,
                displayText: option.displayText,
                displayTexts: option.displayTexts,
            })),
        };
    });

    let quizSession: { id: string };

    try {
        quizSession = await quizSessionRepository.createWithJsonSnapshot({
            userId: session.user.id,
            difficulty: challenge.difficulty,
            questionCount: challenge.questionCount,
            sessionLocale: locale,
            dailyChallengeId: challenge.id,
            questions: snapshotQuestions,
            pickedQuestions,
        });
    } catch (error) {
        if (isUniqueViolation(error)) {
            const raced =
                await dailyChallengeRepository.findAttemptByUserAndChallenge(
                    session.user.id,
                    challenge.id,
                );

            if (raced) {
                redirectExistingAttempt(locale, raced);
            }
        }

        if (error instanceof QuizSessionStartError) {
            return { errorCode: error.code };
        }

        console.error('Daily challenge session create failed:', error);
        return { errorCode: 'INVALID_SETUP' };
    }

    redirect(`/${locale}/quiz/${quizSession.id}`);
}
