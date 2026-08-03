'use server';

import { redirect } from 'next/navigation';

import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { awardAchievementsForUser } from '@/features/achievements/lib/award-achievements-for-user';
import { isTimedSubmitExpired } from '@/features/timed-mode/lib/is-timed-submit-expired';
import { mapQuizStartError } from '@/features/quiz/lib/map-quiz-start-error';
import { requireUser } from '@/lib/auth/guards';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';
import { quizSetupSchema } from '@/features/quiz/lib/validation';
import { calculateQuizScore } from '@/features/quiz/lib/scoring';
import type { QuizFormState } from '@/features/quiz/types';
import { shuffleArray } from '@/shared/utils';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';

// получение локали из формы
function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    // проверяем, является ли локаль валидной
    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

/**
 * Старт квиза. Rate limit по userId — до pick/snapshot на Neon,
 * чтобы спам «Начать» не плодил сессии и не жёг unpooled путь.
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

    let quizSession: { id: string };

    try {
        quizSession = await quizSessionRepository.startWithRandomQuestions({
            userId: session.user.id,
            difficulty: parsed.data.difficulty,
            questionCount: parsed.data.questionCount,
            sessionLocale: locale,
            locale,
            buildSnapshotQuestions: (pickedQuestions) =>
                pickedQuestions.map((question, index) => {
                    const shuffledOptions = shuffleArray(question.options);

                    return {
                        questionId: question.id,
                        position: index,
                        displayText: question.displayText,
                        displayTexts: question.displayTexts,
                        displayImageUrl: normalizeQuizImageUrl(
                            question.displayImageUrl,
                        ),
                        options: shuffledOptions.map((option, optionIndex) => ({
                            optionId: option.id,
                            displayOrder: optionIndex,
                            displayText: option.displayText,
                            displayTexts: option.displayTexts,
                        })),
                    };
                }),
        });
    } catch (error) {
        const errorCode = mapQuizStartError(error);
        if (errorCode === 'INVALID_SETUP') {
            console.error('Quiz session snapshot create failed:', error);
        } else {
            console.error('Quiz start failed:', errorCode, error);
        }
        return { errorCode };
    }

    redirect(`/${locale}/quiz/${quizSession.id}`);
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

    if (sessionForSubmit.status === 'invalid_snapshot') {
        return { errorCode: 'INVALID_ANSWER' };
    }

    const { sessionId: quizSessionId, questions } = sessionForSubmit;
    const isTimedSession = sessionForSubmit.timedEndsAt != null;
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
    const requireAllAnswers = !isTimedSession || !finishedByTimer;
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
            answers: answerRows.map((answer) => ({
                questionId: answer.questionId,
                selectedOptionId: answer.selectedOptionId,
                isCorrect: answer.isCorrect,
            })),
        });

        if (submitResult === 'not_found') {
            return { errorCode: 'SUBMIT_FAILED' };
        }

        // already_completed: QuizResult уже есть — идём на award + result ниже.
    } catch (error) {
        console.error('Quiz submit failed:', error);
        return { errorCode: 'SUBMIT_FAILED' };
    }

    // Soft-fail award после QuizResult (новый или уже существующий).
    // Не внутри completeWithResult — отдельный путь; scoring не меняем.
    // Короткая пауза: write-client teardown + следующий TLS (Windows/Neon).
    await new Promise((resolve) => setTimeout(resolve, 300));
    // `awardedCodes` → flash query на result (display-only; БД = source of truth).
    const award = await awardAchievementsForUser(authSession.user.id);

    const resultQuery = new URLSearchParams();
    if (award.awardedCodes.length > 0) {
        resultQuery.set('unlocked', award.awardedCodes.join(','));
    }
    // Auto-submit / late timed finish → roast на result.
    if (finishedByTimer || (isTimedSession && timedPastGrace)) {
        resultQuery.set('clock', '1');
    }

    const querySuffix = resultQuery.toString();
    redirect(
        `/${locale}/result/${sessionId}${querySuffix ? `?${querySuffix}` : ''}`,
    );
}
