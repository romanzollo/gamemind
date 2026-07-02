'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { questionRepository } from '@/entities/question/question.repository';
import {
    createQuestionSchema,
    updateQuestionSchema,
} from '@/features/admin/lib/validation';
import type { AdminFormState } from '@/features/admin/types';
import { requireAdmin } from '@/lib/auth/guards';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

// функция для получения локаль из формы
function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

// функция для парсинга вариантов ответа из формы
function parseOptionsFromFormData(formData: FormData) {
    const correctOptionIndexRaw = formData.get('correctOptionIndex');
    const correctOptionIndex =
        typeof correctOptionIndexRaw === 'string'
            ? Number(correctOptionIndexRaw)
            : NaN;
    const options: Array<{ text: string; isCorrect: boolean; order: number }> =
        [];

    for (let i = 0; i < 6; i++) {
        const text = formData.get(`optionText-${i}`);

        if (typeof text !== 'string' || text.trim() === '') {
            continue;
        }

        options.push({
            text,
            isCorrect: i === correctOptionIndex,
            order: options.length,
        });
    }

    return options;
}

// парсинг вариантов для edit: нужны optionId-${i} из hidden inputs
function parseOptionsForUpdateFromFormData(formData: FormData) {
    // получаем индекс правильного варианта ответа из формы
    const correctOptionIndexRaw = formData.get('correctOptionIndex');
    // преобразуем индекс в число
    const correctOptionIndex =
        typeof correctOptionIndexRaw === 'string'
            ? Number(correctOptionIndexRaw)
            : NaN;
    // создаем массив вариантов ответа
    const options: Array<{
        id: string;
        text: string;
        isCorrect: boolean;
        order: number;
    }> = [];

    // проходим по всем вариантам ответа
    for (let i = 0; i < 6; i++) {
        // получаем id варианта ответа из формы
        const id = formData.get(`optionId-${i}`);
        // получаем текст варианта ответа из формы
        const text = formData.get(`optionText-${i}`);

        // проверяем, является ли id варианта ответа строкой и не пустой
        if (typeof id !== 'string' || id.trim() === '') {
            continue;
        }

        // проверяем, является ли текст варианта ответа строкой и не пустой
        if (typeof text !== 'string' || text.trim() === '') {
            continue;
        }

        // добавляем вариант ответа в массив
        options.push({
            id,
            text,
            isCorrect: i === correctOptionIndex,
            order: options.length,
        });
    }

    return options;
}

// Action для создания вопроса
export async function createQuestionAction(
    _prevState: AdminFormState,
    formData: FormData,
): Promise<AdminFormState> {
    // получаем локаль из формы
    const locale = getLocaleFromFormData(formData);
    // проверяем, является ли пользователь администратором
    await requireAdmin(locale);

    const parsed = createQuestionSchema.safeParse({
        text: formData.get('text'),
        difficulty: formData.get('difficulty'),
        category: formData.get('category') ?? 'video-games',
        options: parseOptionsFromFormData(formData),
    });

    // проверяем, являются ли данные валидными
    if (!parsed.success) {
        const hasCorrectOptionError = parsed.error.issues.some(
            (issue) => issue.path[0] === 'options',
        );

        return {
            errorCode: hasCorrectOptionError
                ? 'EXACTLY_ONE_CORRECT_REQUIRED'
                : 'INVALID_INPUT',
        };
    }

    // пытаемся создать вопрос с вариантами ответа
    try {
        await questionRepository.createWithOptions(parsed.data);
    } catch {
        return { errorCode: 'SAVE_FAILED' };
    }

    revalidatePath(`/${locale}/admin/questions`);
    redirect(`/${locale}/admin/questions`);
}

export async function deleteQuestionAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(`/${locale}/admin/questions`);
    }

    try {
        await questionRepository.deleteById(questionId);
    } catch {
        redirect(`/${locale}/admin/questions?error=DELETE_FAILED`);
    }

    // перевалидируем путь к странице администрирования вопросов
    revalidatePath(`/${locale}/admin/questions`);
    // перенаправляем на страницу администрирования вопросов
    redirect(`/${locale}/admin/questions`);
}

// Action для редактирования вопроса
export async function updateQuestionAction(
    _prevState: AdminFormState,
    formData: FormData,
): Promise<AdminFormState> {
    // получаем локаль из формы
    const locale = getLocaleFromFormData(formData);
    // проверяем, является ли пользователь администратором
    await requireAdmin(locale);

    // парсим данные из формы
    const parsed = updateQuestionSchema.safeParse({
        // получаем id вопроса из формы
        questionId: formData.get('questionId'),
        // получаем текст вопроса из формы
        text: formData.get('text'),
        // получаем сложность вопроса из формы
        difficulty: formData.get('difficulty'),
        // получаем категорию вопроса из формы
        category: formData.get('category') ?? 'video-games',
        // парсим варианты ответа из формы
        options: parseOptionsForUpdateFromFormData(formData),
    });

    // проверяем, являются ли данные валидными
    if (!parsed.success) {
        // проверяем, есть ли ошибка в вариантах ответа
        const hasCorrectOptionError = parsed.error.issues.some(
            (issue) => issue.path[0] === 'options',
        );

        // возвращаем ошибку
        return {
            errorCode: hasCorrectOptionError
                ? 'EXACTLY_ONE_CORRECT_REQUIRED'
                : 'INVALID_INPUT',
        };
    }

    // пытаемся обновить вопрос и варианты ответа
    try {
        // обновляем вопрос и варианты ответа
        const result = await questionRepository.updateWithOptions(parsed.data);

        if (!result) {
            return { errorCode: 'NOT_FOUND' };
        }
    } catch {
        return { errorCode: 'SAVE_FAILED' };
    }

    // перевалидируем путь к странице администрирования вопросов
    revalidatePath(`/${locale}/admin/questions`);
    // перевалидируем путь к странице редактирования вопроса
    revalidatePath(`/${locale}/admin/questions/${parsed.data.questionId}/edit`);
    // перенаправляем на страницу администрирования вопросов
    redirect(`/${locale}/admin/questions`);
}
