/**
 * Server Action: rematch Classic с result page.
 *
 * Паритет с TimedRematchButton → startTimedQuizAction:
 * отдельный action-файл, сразу новая партия с теми же правилами.
 *
 * Settle 500ms перед pick: form POST идёт с `/result/:id` сразу после
 * тяжёлого submit/result Direct TLS; без паузы Windows+Neon часто даёт
 * ложный DB_TIMEOUT и кнопка висит на «Подождите…» ~25с.
 */

'use server';

import { redirect } from 'next/navigation';

import { runClassicQuizStart } from '@/features/quiz/lib/run-classic-quiz-start';
import { quizSetupSchema } from '@/features/quiz/lib/validation';
import type { QuizFormState } from '@/features/quiz/types';
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

export async function rematchClassicQuizAction(
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

    const parsed = quizSetupSchema.safeParse({
        difficulty: formData.get('difficulty'),
        questionCount: formData.get('questionCount'),
    });

    if (!parsed.success) {
        return { errorCode: 'INVALID_SETUP' };
    }

    // Дать Direct-очереди остыть после result/submit (как award pause).
    await new Promise((resolve) => setTimeout(resolve, 500));

    const started = await runClassicQuizStart({
        userId: session.user.id,
        difficulty: parsed.data.difficulty,
        questionCount: parsed.data.questionCount,
        locale,
    });

    if (!started.ok) {
        return { errorCode: started.errorCode };
    }

    redirect(`/${locale}/quiz/${started.sessionId}`);
}
