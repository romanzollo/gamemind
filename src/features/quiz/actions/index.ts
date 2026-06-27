'use server';

import { redirect } from 'next/navigation';

import { questionRepository } from '@/entities/question/question.repository'; // репозиторий для работы с вопросами
import { quizSessionRepository } from '@/entities/quiz-session/quiz-session.repository'; // репозиторий для работы с сессиями викторины
import { requireUser } from '@/lib/auth/guards';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n'; // функция для получения локали из формы
import { quizSetupSchema } from '@/features/quiz/lib/validation'; // схема для валидации настроек викторины

// получение локали из формы
function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    // проверяем, является ли локаль валидной
    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

// Action для начала викторины
export async function startQuizAction(formData: FormData) {
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
        redirect(`/${locale}/quiz/setup`);
    }

    // получаем количество активных вопросов по сложности
    const availableQuestions = await questionRepository.countActiveByDifficulty(
        parsed.data.difficulty,
    );

    // проверяем, является ли количество активных вопросов больше или равно количеству вопросов для викторины
    if (availableQuestions < parsed.data.questionCount) {
        redirect(`/${locale}/quiz/setup`);
    }

    // создаем сессию викторины
    const quizSession = await quizSessionRepository.create({
        userId: session.user.id,
        difficulty: parsed.data.difficulty,
        questionCount: parsed.data.questionCount,
    });

    // перенаправляем на страницу викторины
    redirect(`/${locale}/quiz/${quizSession.id}`);
}
