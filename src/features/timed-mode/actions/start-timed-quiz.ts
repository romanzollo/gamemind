'use server';

/**
 * Server Action: старт Timed mode.
 *
 * Auth + rate limit здесь; pick/create/timedEndsAt — в `runTimedQuizStart`
 * (изолирован от Classic, чтобы фикс одного режима не ломал другой).
 *
 * Canon: docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import { redirect } from 'next/navigation';

import type { QuizFormState } from '@/features/quiz/types';
import { timedQuizSetupSchema } from '@/features/quiz/lib/validation';
import { runTimedQuizStart } from '@/features/timed-mode/lib/run-timed-quiz-start';
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

    const started = await runTimedQuizStart({
        userId: session.user.id,
        difficulty: parsed.data.difficulty,
        locale,
    });

    if (!started.ok) {
        return { errorCode: started.errorCode };
    }

    redirect(`/${locale}/quiz/${started.sessionId}?f=${Date.now()}`);
}
