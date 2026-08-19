'use server';

/**
 * Server Action: старт Survival волны 1.
 *
 * Auth + rate limit здесь; abandon/run/pick/create — в `runSurvivalQuizStart`.
 * Не звать `runTimedQuizStart`. Mix в FormData отвергает Zod.
 *
 * Canon: docs/DECISIONS.md → Survival Mode MVP;
 * Quiz Start / Session Load Playbook.
 */

import { redirect } from 'next/navigation';

import type { QuizFormState } from '@/features/quiz/types';
import { runSurvivalQuizStart } from '@/features/survival-mode/lib/run-survival-quiz-start';
import { survivalQuizSetupSchema } from '@/features/survival-mode/lib/survival-quiz-setup-schema';
import { requireUser } from '@/lib/auth/guards';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

/**
 * Старт Survival. FormData: `locale` + `difficulty`.
 * questionCount клиент не задаёт — иначе обойдёт контракт волны 12.
 */
export async function startSurvivalQuizAction(
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

    const parsed = survivalQuizSetupSchema.safeParse({
        difficulty: formData.get('difficulty'),
    });

    if (!parsed.success) {
        return { errorCode: 'INVALID_SETUP' };
    }

    const started = await runSurvivalQuizStart({
        userId: session.user.id,
        difficulty: parsed.data.difficulty,
        locale,
    });

    if (!started.ok) {
        return { errorCode: started.errorCode };
    }

    redirect(`/${locale}/quiz/${started.sessionId}?f=${Date.now()}`);
}
