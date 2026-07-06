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

// получение строки из FormData
function getFormString(formData: FormData, name: string): string {
    const value = formData.get(name);

    return typeof value === 'string' ? value : '';
}

// парсинг переводов текста вопроса из формы
function parseQuestionTranslationsFromFormData(formData: FormData) {
    return {
        ru: { text: getFormString(formData, 'questionTextRu') },
        en: { text: getFormString(formData, 'questionTextEn') },
    };
}

function parseQuestionMediaFromFormData(formData: FormData) {
    const typeRaw = getFormString(formData, 'questionType');

    return {
        type: typeRaw === 'IMAGE_GUESS' ? 'IMAGE_GUESS' : 'TEXT',
        promptImageUrl: getFormString(formData, 'promptImageUrl'),
    } as const;
}

// парсинг переводов текста варианта ответа из формы
function parseOptionTranslationsFromFormData(
    formData: FormData,
    index: number,
) {
    return {
        ru: { text: getFormString(formData, `optionTextRu-${index}`) },
        en: { text: getFormString(formData, `optionTextEn-${index}`) },
    };
}

// функция для парсинга вариантов ответа из формы
function parseOptionsFromFormData(formData: FormData) {
    const correctOptionIndexRaw = formData.get('correctOptionIndex');
    const correctOptionIndex =
        typeof correctOptionIndexRaw === 'string'
            ? Number(correctOptionIndexRaw)
            : NaN;
    const options: Array<{
        translations: {
            ru: { text: string };
            en: { text: string };
        };
        isCorrect: boolean;
        order: number;
    }> = [];

    for (let i = 0; i < 6; i++) {
        const translations = parseOptionTranslationsFromFormData(formData, i);

        if (
            translations.ru.text.trim() === '' &&
            translations.en.text.trim() === ''
        ) {
            continue;
        }

        options.push({
            translations,
            isCorrect: i === correctOptionIndex,
            order: options.length,
        });
    }

    return options;
}

// парсинг вариантов для edit: нужны optionId-${i} из hidden inputs
function parseOptionsForUpdateFromFormData(formData: FormData) {
    const correctOptionIndexRaw = formData.get('correctOptionIndex');
    const correctOptionIndex =
        typeof correctOptionIndexRaw === 'string'
            ? Number(correctOptionIndexRaw)
            : NaN;
    const options: Array<{
        id: string;
        translations: {
            ru: { text: string };
            en: { text: string };
        };
        isCorrect: boolean;
        order: number;
    }> = [];

    for (let i = 0; i < 6; i++) {
        const id = formData.get(`optionId-${i}`);
        const translations = parseOptionTranslationsFromFormData(formData, i);

        if (typeof id !== 'string' || id.trim() === '') {
            continue;
        }

        if (
            translations.ru.text.trim() === '' &&
            translations.en.text.trim() === ''
        ) {
            continue;
        }

        options.push({
            id,
            translations,
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
        ...parseQuestionMediaFromFormData(formData),
        translations: parseQuestionTranslationsFromFormData(formData),
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

// Action для деактивации вопроса
export async function deactivateQuestionAction(formData: FormData) {
    // получаем локаль из формы
    const locale = getLocaleFromFormData(formData);
    // проверяем, является ли пользователь администратором
    await requireAdmin(locale);

    // получаем id вопроса из формы
    const questionId = formData.get('questionId');
    // проверяем, является ли id вопроса строкой и не пустой

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(`/${locale}/admin/questions`);
    }

    let result: Awaited<
        ReturnType<typeof questionRepository.deactivateById>
    > | null = null;

    try {
        result = await questionRepository.deactivateById(questionId);
    } catch {
        redirect(`/${locale}/admin/questions?error=DEACTIVATE_FAILED`);
    }

    if (!result || result.status === 'not_found') {
        redirect(`/${locale}/admin/questions?error=NOT_FOUND`);
    }

    // перевалидируем путь к странице администрирования вопросов
    revalidatePath(`/${locale}/admin/questions`);
    // перенаправляем на страницу администрирования вопросов
    redirect(`/${locale}/admin/questions`);
}

// Action для активации вопроса
export async function activateQuestionAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(`/${locale}/admin/questions`);
    }

    let result: Awaited<
        ReturnType<typeof questionRepository.activateById>
    > | null = null;

    try {
        result = await questionRepository.activateById(questionId);
    } catch {
        redirect(`/${locale}/admin/questions?error=ACTIVATE_FAILED`);
    }

    if (!result || result.status === 'not_found') {
        redirect(`/${locale}/admin/questions?error=NOT_FOUND`);
    }

    revalidatePath(`/${locale}/admin/questions`);
    redirect(`/${locale}/admin/questions`);
}

// Action для удаления вопроса
export async function deleteQuestionAction(formData: FormData) {
    // получаем локаль из формы
    const locale = getLocaleFromFormData(formData);
    // проверяем, является ли пользователь администратором
    await requireAdmin(locale);

    // получаем id вопроса из формы
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
        questionId: formData.get('questionId'),
        ...parseQuestionMediaFromFormData(formData),
        translations: parseQuestionTranslationsFromFormData(formData),
        difficulty: formData.get('difficulty'),
        category: formData.get('category') ?? 'video-games',
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
        const result = await questionRepository.updateWithOptions(parsed.data);

        if (!result) {
            return { errorCode: 'NOT_FOUND' };
        }
    } catch (error) {
        if (process.env.NODE_ENV === 'development') {
            console.error('updateQuestionAction failed:', error);
        }

        return { errorCode: 'SAVE_FAILED' };
    }

    // перевалидируем путь к странице администрирования вопросов
    revalidatePath(`/${locale}/admin/questions`);
    // перевалидируем путь к странице редактирования вопроса
    revalidatePath(`/${locale}/admin/questions/${parsed.data.questionId}/edit`);
    // перенаправляем на страницу администрирования вопросов
    redirect(`/${locale}/admin/questions`);
}
