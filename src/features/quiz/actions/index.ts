'use server';

import { redirect } from 'next/navigation';

import { questionRepository } from '@/entities/question/question.repository';
import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository';
import { requireUser } from '@/lib/auth/guards';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';
import { quizSetupSchema } from '@/features/quiz/lib/validation';
import { calculateQuizScore } from '@/features/quiz/lib/scoring';
import type { QuizFormState } from '@/features/quiz/types';
import { shuffleArray } from '@/shared/utils';

// получение локали из формы
function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    // проверяем, является ли локаль валидной
    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

// Action для начала викторины
export async function startQuizAction(
    _prevState: QuizFormState,
    formData: FormData,
): Promise<QuizFormState> {
    // получаем локаль из формы
    const locale = getLocaleFromFormData(formData);
    // получаем сессию пользователя
    const session = await requireUser(locale);

    // парсим данные из формы
    const parsed = quizSetupSchema.safeParse({
        difficulty: formData.get('difficulty'),
        questionCount: formData.get('questionCount'),
    });

    // проверяем, являются ли данные валидными
    if (!parsed.success) {
        return { errorCode: 'INVALID_SETUP' };
    }

    // получаем случайные вопросы отдельным read-запросом, чтобы write-транзакция была короткой
    const pickedQuestions =
        await questionRepository.pickRandomActiveForSnapshot(
            parsed.data.difficulty,
            parsed.data.questionCount,
        );

    // проверяем, является ли количество полученных вопросов больше или равно количеству вопросов для викторины
    if (pickedQuestions.length < parsed.data.questionCount) {
        return { errorCode: 'NOT_ENOUGH_QUESTIONS' };
    }

    // собираем данные для snapshot вопросов и порядка вариантов
    const snapshotQuestions = pickedQuestions.map((question, index) => {
        const shuffledOptions = shuffleArray(question.options);

        return {
            questionId: question.id,
            position: index,
            options: shuffledOptions.map((option, optionIndex) => ({
                optionId: option.id,
                displayOrder: optionIndex,
            })),
        };
    });

    let quizSession: { id: string };

    try {
        // создаем сессию викторины с snapshot вопросов и порядка вариантов
        quizSession = await quizSessionRepository.createWithSnapshot({
            userId: session.user.id,
            difficulty: parsed.data.difficulty,
            questionCount: parsed.data.questionCount,
            questions: snapshotQuestions,
        });
    } catch (error) {
        console.error('Quiz session snapshot create failed:', error);
        return { errorCode: 'INVALID_SETUP' };
    }

    // перенаправляем на страницу викторины
    redirect(`/${locale}/quiz/${quizSession.id}`);
}

// Action для отправки результатов викторины
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
        redirect(`/${locale}/quiz/setup`);
    }

    // получаем сессию пользователя
    const authSession = await requireUser(locale);

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

    // собираем ответы пользователя из формы
    const answers = questions.map((question) => {
        const selectedOptionId = formData.get(question.id);

        return {
            questionId: question.id,
            selectedOptionId:
                typeof selectedOptionId === 'string' ? selectedOptionId : '',
        };
    });

    // проверяем, что на все вопросы даны ответы
    const allAnswered = answers.every(
        (answer) => answer.selectedOptionId.length > 0,
    );

    if (!allAnswered) {
        return { errorCode: 'ANSWER_ALL' };
    }

    // проверяем, что все выбранные варианты ответов существуют
    const allValid = answers.every((answer) => {
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

    // вычисляем результаты викторины
    const scoreResult = calculateQuizScore(questions, answers);

    // подготавливаем данные для сохранения ответов
    const answerRows = answers.map((answer) => {
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

        if (
            submitResult === 'not_found' ||
            submitResult === 'already_completed'
        ) {
            if (submitResult === 'already_completed') {
                redirect(`/${locale}/result/${sessionId}`);
            }

            return { errorCode: 'SUBMIT_FAILED' };
        }
    } catch (error) {
        console.error('Quiz submit failed:', error);
        return { errorCode: 'SUBMIT_FAILED' };
    }

    // перенаправляем на страницу с результатами
    redirect(`/${locale}/result/${sessionId}`);
}
