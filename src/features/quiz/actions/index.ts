'use server';

import { redirect } from 'next/navigation';

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { isTimedSubmitExpired } from '@/features/timed-mode/lib/is-timed-submit-expired';
import { requireUser } from '@/lib/auth/guards';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';
import { runClassicQuizStart } from '@/features/quiz/lib/run-classic-quiz-start';
import { quizSetupSchema } from '@/features/quiz/lib/validation';
import { calculateQuizScore } from '@/features/quiz/lib/scoring';
import { buildCompactReviewPayload } from '@/features/quiz/lib/build-compact-review-payload';
import { isSurvivalClockOk } from '@/features/survival-mode/lib/is-survival-clock-ok';
import { reconstructSurvivalBankRemainingSeconds } from '@/features/survival-mode/lib/reconstruct-survival-bank-remaining-seconds';
import { survivalRunRepository } from '@/entities/survival-run/survival-run.repository';
import type { QuizFormState } from '@/features/quiz/types';

// получение локали из формы
function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    // проверяем, является ли локаль валидной
    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

/**
 * Старт Classic. Rate limit по userId — до pick/snapshot на Neon.
 *
 * Оркестрация: `runClassicQuizStart` (изолирована от Timed).
 * Rematch: `rematchClassicQuizAction` → тот же helper.
 * Canon: docs/DECISIONS.md → Quiz Start / Session Load Playbook.
 */
export async function startQuizAction(
    _prevState: QuizFormState,
    formData: FormData,
): Promise<QuizFormState> {
    // получаем локаль из формы
    const locale = getLocaleFromFormData(formData);
    // получаем сессию пользователя
    const session = await requireUser(locale);

    const rate = checkPresetRateLimit(
        'quiz',
        getUserRateLimitIdentity(session.user.id),
    );
    if (!rate.ok) {
        return { errorCode: 'RATE_LIMITED' };
    }

    // парсим данные из формы
    const parsed = quizSetupSchema.safeParse({
        difficulty: formData.get('difficulty'),
        questionCount: formData.get('questionCount'),
    });

    // проверяем, являются ли данные валидными
    if (!parsed.success) {
        return { errorCode: 'INVALID_SETUP' };
    }

    const started = await runClassicQuizStart({
        userId: session.user.id,
        difficulty: parsed.data.difficulty,
        questionCount: parsed.data.questionCount,
        locale,
    });

    if (!started.ok) {
        return { errorCode: started.errorCode };
    }

    redirect(`/${locale}/quiz/${started.sessionId}?f=${Date.now()}`);
}

/**
 * Submit квиза. Rate limit по userId — до read snapshot / scoring / write.
 * Логика scoring и snapshot не менялась: лимит только у входа в action.
 */
export async function submitQuizAction(
    _prevState: QuizFormState,
    formData: FormData,
): Promise<QuizFormState> {
    // получаем локаль из формы
    const locale = getLocaleFromFormData(formData);
    // получаем ID сессии из формы
    const sessionId = formData.get('sessionId');

    // проверяем, что sessionId передан и является строкой
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
        redirect(`/${locale}/quiz`);
    }

    // получаем сессию пользователя
    const authSession = await requireUser(locale);

    const rate = checkPresetRateLimit(
        'quiz',
        getUserRateLimitIdentity(authSession.user.id),
    );
    if (!rate.ok) {
        return { errorCode: 'RATE_LIMITED' };
    }

    // одна read-операция: активная сессия + snapshot для scoring
    const sessionForSubmit = await quizSessionRepository.findSessionForSubmit(
        sessionId,
        authSession.user.id,
    );

    if (sessionForSubmit.status === 'not_found') {
        redirect(`/${locale}/result/${sessionId}`);
    }

    if (sessionForSubmit.status === 'snapshot_unavailable') {
        // Survival TOAST miss после retry — не «плохие ответы».
        return { errorCode: 'SUBMIT_FAILED' };
    }

    if (sessionForSubmit.status === 'invalid_snapshot') {
        return { errorCode: 'INVALID_ANSWER' };
    }

    const { sessionId: quizSessionId, questions } = sessionForSubmit;
    const isTimedSession = sessionForSubmit.timedEndsAt != null;
    const survivalSubmitMeta = sessionForSubmit.survival;
    const isSurvivalSession = survivalSubmitMeta != null;
    // Дедлайн прошёл (с grace) — всё равно сохраняем partial и идём на result
    // с roast (?clock=1). Раньше здесь был TIMED_OUT void + recovery на квизе;
    // продукт: всегда страница результата, как Kahoot/LMS.
    const timedPastGrace = isTimedSubmitExpired(sessionForSubmit.timedEndsAt);
    const finishedByTimer = formData.get('finishedByTimer') === '1';

    // собираем ответы пользователя из формы
    const answers = questions.map((question) => {
        const selectedOptionId = formData.get(question.id);

        return {
            questionId: question.id,
            selectedOptionId:
                typeof selectedOptionId === 'string' ? selectedOptionId : '',
        };
    });

    // Classic/daily: все ответы обязательны.
    // Timed manual finish: тоже все ответы.
    // Timed auto-submit (finishedByTimer): partial OK — пустые = 0 в scoring.
    // Survival: partial OK (bank=0 до 12 ответов).
    const requireAllAnswers =
        (!isTimedSession && !isSurvivalSession) || (isTimedSession && !finishedByTimer);
    if (requireAllAnswers) {
        const allAnswered = answers.every(
            (answer) => answer.selectedOptionId.length > 0,
        );

        if (!allAnswered) {
            return { errorCode: 'ANSWER_ALL' };
        }
    }

    const answeredRows = answers.filter(
        (answer) => answer.selectedOptionId.length > 0,
    );

    // Пустые у timed пропускаем; непустые должны быть валидными optionId.
    const allValid = answeredRows.every((answer) => {
        const question = questions.find(
            (item) => item.id === answer.questionId,
        );

        return question?.options.some(
            (option) => option.id === answer.selectedOptionId,
        );
    });

    if (!allValid) {
        return { errorCode: 'INVALID_ANSWER' };
    }

    // вычисляем результаты викторины (missing answers = 0 в calculateQuizScore)
    const scoreResult = calculateQuizScore(questions, answeredRows);

    // подготавливаем данные для сохранения ответов
    const answerRows = answeredRows.map((answer) => {
        const question = questions.find(
            (item) => item.id === answer.questionId,
        );

        const selectedOption = question?.options.find(
            (option) => option.id === answer.selectedOptionId,
        );

        return {
            sessionId: quizSessionId,
            questionId: answer.questionId,
            selectedOptionId: answer.selectedOptionId,
            isCorrect: selectedOption?.isCorrect ?? false,
        };
    });
    const completedAt = new Date();
    const survivalClockOk = survivalSubmitMeta
        ? isSurvivalClockOk({
              startedAtMs: new Date(survivalSubmitMeta.startedAt).getTime(),
              completedAtMs: completedAt.getTime(),
              correctCount: answerRows.filter((answer) => answer.isCorrect)
                  .length,
              wrongCount: answerRows.filter((answer) => !answer.isCorrect)
                  .length,
              initialBankSeconds: survivalSubmitMeta.initialBankSeconds,
          })
        : null;

    const survivalBankRemainingSeconds = survivalSubmitMeta
        ? reconstructSurvivalBankRemainingSeconds({
              startedAtMs: new Date(survivalSubmitMeta.startedAt).getTime(),
              completedAtMs: completedAt.getTime(),
              correctCount: answerRows.filter((answer) => answer.isCorrect)
                  .length,
              wrongCount: answerRows.filter((answer) => !answer.isCorrect)
                  .length,
              initialBankSeconds: survivalSubmitMeta.initialBankSeconds,
          })
        : null;

    // Slim review из уже загруженного snapshot — без второго TOAST read на result.
    const reviewPayload = sessionForSubmit.snapshotData
        ? buildCompactReviewPayload({
              snapshotData: sessionForSubmit.snapshotData,
              answers: answeredRows,
          })
        : null;

    // сохраняем все данные одной короткой SQL-транзакцией
    // redirect() нельзя вызывать внутри этого try — Next бросает NEXT_REDIRECT,
    // и catch принял бы его за SUBMIT_FAILED.
    try {
        const submitResult = await quizSessionRepository.completeWithResult({
            sessionId: quizSessionId,
            userId: authSession.user.id,
            score: scoreResult.score,
            totalQuestions: scoreResult.totalQuestions,
            correctCount: scoreResult.correctCount,
            completedAt,
            survivalClockOk,
            answers: answerRows.map((answer) => ({
                questionId: answer.questionId,
                selectedOptionId: answer.selectedOptionId,
                isCorrect: answer.isCorrect,
            })),
            reviewPayload,
        });

        if (submitResult === 'not_found') {
            return { errorCode: 'SUBMIT_FAILED' };
        }

        // Survival wave 2+: pooled after-hop (bank + seen + total). Не JSONB,
        // не Direct, не валит submit/redirect при ошибке.
        // already_completed тоже зовём — record идемпотентен по seen ids.
        if (
            isSurvivalSession &&
            survivalSubmitMeta &&
            survivalBankRemainingSeconds != null &&
            survivalClockOk != null &&
            (submitResult === 'completed' ||
                submitResult === 'already_completed')
        ) {
            const afterCompleteInput = {
                runId: survivalSubmitMeta.runId,
                userId: authSession.user.id,
                questionIds: questions.map((question) => question.id),
                bankRemainingSeconds: survivalBankRemainingSeconds,
                waveScore: scoreResult.score,
                clockOk: survivalClockOk,
            };

            try {
                await survivalRunRepository.recordSurvivalWaveAfterComplete(
                    afterCompleteInput,
                );
            } catch (error) {
                console.warn(
                    'Survival after-complete record retry:',
                    error,
                );
                try {
                    await survivalRunRepository.recordSurvivalWaveAfterComplete(
                        afterCompleteInput,
                    );
                } catch (retryError) {
                    console.warn(
                        'Survival after-complete record skipped:',
                        retryError,
                    );
                }
            }
        }

        // already_completed: QuizResult уже есть — идём на result; outbox/award ниже.
    } catch (error) {
        console.error('Quiz submit failed:', error);
        return { errorCode: 'SUBMIT_FAILED' };
    }

    /**
     * Award не на критичном пути до result read и не через after():
     * after() гоняется с result Direct-hop на общей очереди (Windows wedge).
     * complete уже записал AchievementOutbox на том же write-client;
     * result Suspense (после score load) + profile catch-up обрабатывают pending.
     */

    const resultQuery = new URLSearchParams();
    // Auto-submit / late timed finish → roast на result.
    if (finishedByTimer || (isTimedSession && timedPastGrace)) {
        resultQuery.set('clock', '1');
    }

    // Survival bank=0: honest plaque (cut = mid-wave, bank = all locked at 0).
    const survivalWaveEnd = formData.get('survivalWaveEnd');
    if (
        isSurvivalSession &&
        (survivalWaveEnd === 'cut' || survivalWaveEnd === 'bank')
    ) {
        resultQuery.set('wave', survivalWaveEnd);
    }

    const querySuffix = resultQuery.toString();
    redirect(
        `/${locale}/result/${sessionId}${querySuffix ? `?${querySuffix}` : ''}`,
    );
}
