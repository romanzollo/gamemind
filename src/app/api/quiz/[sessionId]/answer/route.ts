/**
 * Фиксация ответа на один вопрос (все режимы, Survival — с банком на сдаче).
 *
 * POST `{ question, option, key }` — токены сессии и ключ ответа из данных
 * игры. Ответ: верно ли, токен правильного варианта, был ли это повтор.
 * Игрок — из JWT (без чтения строки User: лишний хоп на каждый ответ);
 * владение сессией проверяет сам INSERT. Время — момент прихода запроса.
 *
 * 400 — не тот ключ / токен; 409 CLOSED / TIME_UP; 429 — лимит;
 * 503 RETRY — сбой Neon, повтор безопасен (первый ответ побеждает).
 * Canon: docs/DECISIONS.md → Answer lock-in; QUIZ_NEON_HOT_PATH → E2.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { lockQuizAnswer } from '@/features/quiz/lib/lock-quiz-answer';
import { auth } from '@/lib/auth';
import {
    DirectPgTimeoutError,
    isTransientDirectPgError,
} from '@/lib/db/direct-pg';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';

type AnswerRouteContext = {
    params: Promise<{ sessionId: string }>;
};

const answerBodySchema = z.object({
    question: z.string().min(1).max(64),
    option: z.string().min(1).max(64),
    key: z.string().min(1).max(4096),
});

export async function POST(
    request: Request,
    context: AnswerRouteContext,
): Promise<NextResponse> {
    const receivedAt = new Date();
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const rate = checkPresetRateLimit(
        'quizAnswer',
        getUserRateLimitIdentity(userId),
    );
    if (!rate.ok) {
        return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
    }

    const body = answerBodySchema.safeParse(
        await request.json().catch(() => null),
    );
    if (!body.success) {
        return NextResponse.json({ error: 'INVALID' }, { status: 400 });
    }

    const { sessionId } = await context.params;

    try {
        const result = await lockQuizAnswer(
            {
                sessionId,
                userId,
                questionToken: body.data.question,
                optionToken: body.data.option,
                answerKey: body.data.key,
                receivedAt,
            },
            quizSessionRepository,
        );

        switch (result.status) {
            case 'locked':
                return NextResponse.json({
                    correct: result.correct,
                    correctOption: result.correctOption,
                    selectedOption: result.selectedOption,
                    replay: result.replay,
                });
            case 'invalid':
                return NextResponse.json({ error: 'INVALID' }, { status: 400 });
            case 'time_up':
                return NextResponse.json({ error: 'TIME_UP' }, { status: 409 });
            case 'closed':
                return NextResponse.json({ error: 'CLOSED' }, { status: 409 });
        }
    } catch (error) {
        if (
            error instanceof DirectPgTimeoutError ||
            isTransientDirectPgError(error)
        ) {
            // Ожидаемый флейк Neon: клиент покажет «Ещё раз», повтор безопасен.
            console.warn(
                'Quiz answer lock retryable failure:',
                error instanceof Error ? error.message : error,
            );
            return NextResponse.json({ error: 'RETRY' }, { status: 503 });
        }

        console.error('Quiz answer lock failed:', error);
        captureAppError(error, {
            area: 'quiz-submit',
            extra: { stage: 'answer-lock', sessionId },
        });
        return NextResponse.json({ error: 'RETRY' }, { status: 503 });
    }
}
