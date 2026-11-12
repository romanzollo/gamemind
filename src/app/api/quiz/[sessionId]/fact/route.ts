/**
 * Факт «А ты знал?» к вопросу, на который игрок только что ответил.
 *
 * POST `{ question, key, exclude, locale }` — токен вопроса и ключ ответа
 * из данных игры (как у `/answer`), ключи уже показанных в партии фактов.
 * Ответ всегда `{ fact: { key, text } | null }`: факт — бонус, клиент не
 * показывает ошибок и «Дальше» его не ждёт. Ключ ответа открывает только
 * id вопроса; сам факт отдаётся, лишь если ответ на вопрос уже записан
 * (`triviaFactRepository.findCandidatesForLockedAnswer`).
 *
 * Не горячий путь: фиксация ответа, сдача и часы не меняются; запрос идёт
 * после фиксации, один короткий pooled SELECT.
 * Canon: docs/DECISIONS.md → Did you know: trivia facts.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { triviaFactRepository } from '@/entities/trivia-fact/trivia-fact.repository';
import { openQuizAnswerKey } from '@/entities/quiz-session/quiz-answer-key';
import { createQuizPublicIdCodec } from '@/entities/quiz-session/quiz-public-ids';
import {
    pickTriviaFact,
    triviaFactSeed,
} from '@/features/quiz/lib/pick-trivia-fact';
import { auth } from '@/lib/auth';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { isLocale } from '@/shared/i18n';

type FactRouteContext = {
    params: Promise<{ sessionId: string }>;
};

const factBodySchema = z.object({
    question: z.string().min(1).max(64),
    key: z.string().min(1).max(4096),
    exclude: z.array(z.string().min(1).max(80)).max(20).default([]),
    locale: z.string().max(5).optional(),
});

const NO_FACT = { fact: null } as const;

export async function POST(
    request: Request,
    context: FactRouteContext,
): Promise<NextResponse> {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json(NO_FACT, { status: 401 });
    }

    const rate = checkPresetRateLimit(
        'quizFact',
        getUserRateLimitIdentity(userId),
    );
    if (!rate.ok) {
        return NextResponse.json(NO_FACT, { status: 429 });
    }

    const body = factBodySchema.safeParse(
        await request.json().catch(() => null),
    );
    if (!body.success) {
        return NextResponse.json(NO_FACT, { status: 400 });
    }

    const { sessionId } = await context.params;
    const answerKey = openQuizAnswerKey(body.data.key, sessionId);
    if (
        !answerKey ||
        createQuizPublicIdCodec(sessionId).question(answerKey.questionId) !==
            body.data.question
    ) {
        return NextResponse.json(NO_FACT, { status: 400 });
    }

    try {
        const candidates =
            await triviaFactRepository.findCandidatesForLockedAnswer({
                sessionId,
                userId,
                questionId: answerKey.questionId,
            });
        const fact = pickTriviaFact(candidates, {
            seed: triviaFactSeed(sessionId, answerKey.questionId),
            exclude: body.data.exclude,
        });
        if (!fact) {
            return NextResponse.json(NO_FACT);
        }
        const locale =
            body.data.locale && isLocale(body.data.locale)
                ? body.data.locale
                : 'ru';
        return NextResponse.json({
            fact: {
                key: fact.key,
                text: locale === 'en' ? fact.textEn : fact.textRu,
            },
        });
    } catch (error) {
        // Бонус, не ошибка игры: в мониторинг не шлём, плашка просто без факта.
        console.warn(
            'Trivia fact lookup failed:',
            error instanceof Error ? error.message : error,
        );
        return NextResponse.json(NO_FACT);
    }
}
