'use server';

/**
 * Server Action: старт Timed mode.
 *
 * Поток (как classic, с фиксированными MVP-правилами):
 * 1) auth + rate limit (preset `quiz`);
 * 2) difficulty из формы; questionCount / duration — из TIMED_MODE_MVP_RULES;
 * 3) pick random PUBLISHED bundle → JSON snapshot;
 * 4) timedEndsAt = now + durationSeconds (серверный авторитет часов).
 *
 * Submit / countdown UI пока не меняем — сессия уже «timed» в БД.
 * Canon: docs/DECISIONS.md → Timed Mode MVP.
 */

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { questionRepository } from '@/entities/question/question.repository';
import {
    quizSessionRepository,
    QuizSessionStartError,
} from '@/entities/quiz-session/quiz-session.repository';
import { TIMED_MODE_MVP_RULES } from '@/features/timed-mode/types';
import type { QuizFormState } from '@/features/quiz/types';
import { requireUser } from '@/lib/auth/guards';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';
import { shuffleArray } from '@/shared/utils';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

/** Только сложность: count и duration зафиксированы правилами MVP. */
const timedQuizSetupSchema = z.object({
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
});

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

/**
 * Старт timed. FormData: `locale` + `difficulty`.
 * questionCount / durationSeconds клиент не задаёт — иначе обойдёт контракт.
 */
export async function startTimedQuizAction(
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

    const parsed = timedQuizSetupSchema.safeParse({
        difficulty: formData.get('difficulty'),
    });

    if (!parsed.success) {
        return { errorCode: 'INVALID_SETUP' };
    }

    const { questionCount, durationSeconds } = TIMED_MODE_MVP_RULES;
    const timedEndsAt = new Date(Date.now() + durationSeconds * 1000);

    const pickedQuestions =
        await questionRepository.pickRandomActiveSnapshotBundle(
            parsed.data.difficulty,
            questionCount,
            locale,
        );

    if (pickedQuestions.length < questionCount) {
        return { errorCode: 'NOT_ENOUGH_QUESTIONS' };
    }

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
            difficulty: parsed.data.difficulty,
            questionCount,
            sessionLocale: locale,
            timedEndsAt,
            questions: snapshotQuestions,
            pickedQuestions,
        });
    } catch (error) {
        if (error instanceof QuizSessionStartError) {
            return { errorCode: error.code };
        }

        console.error('Timed quiz session create failed:', error);
        return { errorCode: 'INVALID_SETUP' };
    }

    redirect(`/${locale}/quiz/${quizSession.id}`);
}
