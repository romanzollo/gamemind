'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { questionRepository } from '@/entities/question/question.repository';
import { resolveAdminPromptImage } from '@/features/admin/lib/resolve-prompt-image';
import {
    createQuestionSchema,
    updateQuestionSchema,
} from '@/features/admin/lib/validation';
import type { AdminFormState } from '@/features/admin/types';
import { requireAdmin } from '@/lib/auth/guards';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

function getFormString(formData: FormData, name: string): string {
    const value = formData.get(name);

    return typeof value === 'string' ? value : '';
}

function parseQuestionTranslationsFromFormData(formData: FormData) {
    return {
        ru: { text: getFormString(formData, 'questionTextRu') },
        en: { text: getFormString(formData, 'questionTextEn') },
    };
}

/** Тип вопроса из формы; file/URL резолвятся в resolveAdminPromptImage. */
function parseQuestionTypeFromFormData(formData: FormData) {
    const typeRaw = getFormString(formData, 'questionType');

    return typeRaw === 'IMAGE_GUESS' ? 'IMAGE_GUESS' : 'TEXT';
}

function parseOptionTranslationsFromFormData(
    formData: FormData,
    index: number,
) {
    return {
        ru: { text: getFormString(formData, `optionTextRu-${index}`) },
        en: { text: getFormString(formData, `optionTextEn-${index}`) },
    };
}

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

/**
 * Создание вопроса.
 * Для IMAGE_GUESS: file → sharp → storage.put → URL в QuestionAsset (или URL-поле).
 */
export async function createQuestionAction(
    _prevState: AdminFormState,
    formData: FormData,
): Promise<AdminFormState> {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const type = parseQuestionTypeFromFormData(formData);
    // id заранее — совпадает со storage key до INSERT
    const questionId = randomUUID();

    const resolved = await resolveAdminPromptImage({
        formData,
        type,
        questionIdForKey: questionId,
    });

    if (!resolved.ok) {
        return { errorCode: resolved.errorCode };
    }

    const parsed = createQuestionSchema.safeParse({
        id: questionId,
        type,
        promptImageUrl: resolved.value.promptImageUrl,
        promptAsset: resolved.value.promptAsset,
        translations: parseQuestionTranslationsFromFormData(formData),
        difficulty: formData.get('difficulty'),
        category: formData.get('category') ?? 'video-games',
        options: parseOptionsFromFormData(formData),
    });

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

    try {
        await questionRepository.createWithOptions(parsed.data);
    } catch {
        return { errorCode: 'SAVE_FAILED' };
    }

    revalidatePath(`/${locale}/admin/questions`);
    redirect(`/${locale}/admin/questions`);
}

export async function deactivateQuestionAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

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

    revalidatePath(`/${locale}/admin/questions`);
    redirect(`/${locale}/admin/questions`);
}

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

    revalidatePath(`/${locale}/admin/questions`);
    redirect(`/${locale}/admin/questions`);
}

/**
 * Редактирование вопроса.
 * Новый file заменяет prompt URL; старый `/media/...` удаляется best-effort.
 */
export async function updateQuestionAction(
    _prevState: AdminFormState,
    formData: FormData,
): Promise<AdminFormState> {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionIdRaw = formData.get('questionId');
    if (typeof questionIdRaw !== 'string' || questionIdRaw.trim() === '') {
        return { errorCode: 'INVALID_INPUT' };
    }
    const questionId = questionIdRaw.trim();

    const type = parseQuestionTypeFromFormData(formData);
    const previousPublicUrl = getFormString(formData, 'previousPromptImageUrl');

    const resolved = await resolveAdminPromptImage({
        formData,
        type,
        questionIdForKey: questionId,
        previousPublicUrl: previousPublicUrl || null,
    });

    if (!resolved.ok) {
        return { errorCode: resolved.errorCode };
    }

    const parsed = updateQuestionSchema.safeParse({
        questionId,
        type,
        promptImageUrl: resolved.value.promptImageUrl,
        promptAsset: resolved.value.promptAsset,
        translations: parseQuestionTranslationsFromFormData(formData),
        difficulty: formData.get('difficulty'),
        category: formData.get('category') ?? 'video-games',
        options: parseOptionsForUpdateFromFormData(formData),
    });

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

    revalidatePath(`/${locale}/admin/questions`);
    revalidatePath(`/${locale}/admin/questions/${parsed.data.questionId}/edit`);
    redirect(`/${locale}/admin/questions`);
}
