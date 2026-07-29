'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { questionRepository } from '@/entities/question/question.repository';
import { parseBulkQuestionIdsFromFormData } from '@/features/admin/lib/parse-bulk-question-ids';
import {
    getQuestionPublishQualityIssues,
    hasPublishQualityBlockers,
} from '@/features/admin/lib/question-publish-quality';
import { resolveAdminPromptImage } from '@/features/admin/lib/resolve-prompt-image';
import {
    createQuestionSchema,
    updateQuestionSchema,
} from '@/features/admin/lib/validation';
import type { AdminFormState } from '@/features/admin/types';
import { requireAdmin } from '@/lib/auth/guards';
import { checkPresetRateLimit } from '@/lib/rate-limit';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

/**
 * Куда вернуть после publication action.
 * `returnTo=edit` — остаёмся на странице edit (кнопки панели редактирования);
 * иначе список `/admin/questions` (кнопки в таблице).
 */
function getPublicationRedirectPath(
    formData: FormData,
    locale: Locale,
    questionId: string,
): string {
    const returnTo = formData.get('returnTo');

    if (returnTo === 'edit') {
        return `/${locale}/admin/questions/${questionId}/edit`;
    }

    return `/${locale}/admin/questions`;
}

function getPublicationReturnTo(formData: FormData): 'edit' | 'list' {
    return formData.get('returnTo') === 'edit' ? 'edit' : 'list';
}

/**
 * List всегда; edit — только если action вернул на edit (иначе лишний RSC work).
 */
function revalidatePublicationPaths(
    locale: Locale,
    questionId: string,
    returnTo: 'edit' | 'list',
) {
    revalidatePath(`/${locale}/admin/questions`);
    if (returnTo === 'edit') {
        revalidatePath(`/${locale}/admin/questions/${questionId}/edit`);
    }
}

function redirectWithOptionalError(path: string, error?: string): never {
    if (!error) {
        redirect(path);
    }

    redirect(`${path}?error=${error}`);
}

/**
 * Quality gate перед publish / submit-for-review.
 *
 * Blockers → всегда edit + PUBLISH_QUALITY_BLOCKED (панель видна; даже если
 * клик был со списка). Warnings не блокируют. Уже в целевом статусе —
 * пропускаем (idempotent no-op без лишнего отказа).
 * returnToDraft не гейтим — вывод из пула безопасен.
 */
async function assertPublishQualityOrRedirect(
    questionId: string,
    locale: Locale,
    options: {
        /** Статус, при котором переход уже no-op — gate не нужен. */
        skipIfStatus: 'PUBLISHED' | 'IN_REVIEW';
        loadFailedError: 'PUBLISH_FAILED' | 'SUBMIT_FOR_REVIEW_FAILED';
        fallbackRedirectPath: string;
    },
): Promise<void> {
    let question: Awaited<
        ReturnType<typeof questionRepository.findByIdForAdmin>
    > = null;

    try {
        question = await questionRepository.findByIdForAdmin(questionId);
    } catch {
        redirectWithOptionalError(
            options.fallbackRedirectPath,
            options.loadFailedError,
        );
    }

    if (!question) {
        redirectWithOptionalError(options.fallbackRedirectPath, 'NOT_FOUND');
    }

    if (question.publicationStatus === options.skipIfStatus) {
        return;
    }

    const issues = getQuestionPublishQualityIssues(question);
    if (hasPublishQualityBlockers(issues)) {
        redirect(
            `/${locale}/admin/questions/${questionId}/edit?error=PUBLISH_QUALITY_BLOCKED`,
        );
    }
}

/**
 * Bulk quality gate: какие id можно безопасно менять publicationStatus.
 *
 * Для каждого id (последовательно — Neon не любит параллельные TLS):
 * - нет строки / переход не из fromStatuses → skip (как bulk isActive);
 * - уже target → skip (idempotent);
 * - blockers → запоминаем первый blocked (уйдём на его edit);
 * - иначе → eligible.
 *
 * Partial success: eligible обновляем SQL-ом; blocked чинит админ на edit.
 * Не кладём quality SQL в admin list queue.
 */
async function collectEligibleBulkPublicationIds(
    ids: readonly string[],
    options: {
        targetStatus: 'PUBLISHED' | 'IN_REVIEW';
        fromStatuses: readonly ('DRAFT' | 'IN_REVIEW')[];
    },
): Promise<
    | { ok: true; eligibleIds: string[]; firstBlockedId: string | null }
    | { ok: false }
> {
    const eligibleIds: string[] = [];
    let firstBlockedId: string | null = null;

    for (const id of ids) {
        let question: Awaited<
            ReturnType<typeof questionRepository.findByIdForAdmin>
        > = null;

        try {
            question = await questionRepository.findByIdForAdmin(id);
        } catch {
            return { ok: false };
        }

        if (!question) {
            continue;
        }

        if (question.publicationStatus === options.targetStatus) {
            continue;
        }

        // Только разрешённые «откуда» (как PUBLICATION_TRANSITIONS в repo).
        const fromStatus = question.publicationStatus;
        if (fromStatus !== 'DRAFT' && fromStatus !== 'IN_REVIEW') {
            continue;
        }
        if (!options.fromStatuses.includes(fromStatus)) {
            continue;
        }

        const issues = getQuestionPublishQualityIssues(question);
        if (hasPublishQualityBlockers(issues)) {
            if (firstBlockedId === null) {
                firstBlockedId = id;
            }
            continue;
        }

        eligibleIds.push(id);
    }

    return { ok: true, eligibleIds, firstBlockedId };
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
 * Rate limit по admin userId — до sharp/Blob и до записи в Neon.
 */
export async function createQuestionAction(
    _prevState: AdminFormState,
    formData: FormData,
): Promise<AdminFormState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireAdmin(locale);

    const rate = checkPresetRateLimit(
        'upload',
        getUserRateLimitIdentity(session.user.id),
    );
    if (!rate.ok) {
        return { errorCode: 'RATE_LIMITED' };
    }

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

/**
 * Bulk soft-hide: несколько questionIds → isActive=false.
 * Пустой выбор — silent redirect (как пустой questionId у single).
 * Idempotent: уже inactive не ломают операцию.
 */
export async function deactivateQuestionsBulkAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionIds = parseBulkQuestionIdsFromFormData(formData);

    if (questionIds.length === 0) {
        redirect(`/${locale}/admin/questions`);
    }

    try {
        await questionRepository.deactivateManyByIds(questionIds);
    } catch {
        redirect(`/${locale}/admin/questions?error=DEACTIVATE_FAILED`);
    }

    revalidatePath(`/${locale}/admin/questions`);
    redirect(`/${locale}/admin/questions`);
}

/**
 * Bulk restore в витрину: несколько questionIds → isActive=true.
 * publicationStatus не меняем. Пустой выбор — silent redirect.
 */
export async function activateQuestionsBulkAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionIds = parseBulkQuestionIdsFromFormData(formData);

    if (questionIds.length === 0) {
        redirect(`/${locale}/admin/questions`);
    }

    try {
        await questionRepository.activateManyByIds(questionIds);
    } catch {
        redirect(`/${locale}/admin/questions?error=ACTIVATE_FAILED`);
    }

    revalidatePath(`/${locale}/admin/questions`);
    redirect(`/${locale}/admin/questions`);
}

/**
 * Bulk DRAFT → IN_REVIEW для выбранных id.
 * Quality blockers → eligible всё равно уходят в UPDATE; первый blocked
 * открываем на edit (как single submit). Пустой выбор — silent redirect.
 */
export async function submitQuestionsForReviewBulkAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionIds = parseBulkQuestionIdsFromFormData(formData);

    if (questionIds.length === 0) {
        redirect(`/${locale}/admin/questions`);
    }

    const filtered = await collectEligibleBulkPublicationIds(questionIds, {
        targetStatus: 'IN_REVIEW',
        fromStatuses: ['DRAFT'],
    });

    if (!filtered.ok) {
        redirect(`/${locale}/admin/questions?error=SUBMIT_FOR_REVIEW_FAILED`);
    }

    if (filtered.eligibleIds.length > 0) {
        try {
            await questionRepository.submitForReviewManyByIds(
                filtered.eligibleIds,
            );
        } catch {
            redirect(
                `/${locale}/admin/questions?error=SUBMIT_FOR_REVIEW_FAILED`,
            );
        }
    }

    revalidatePath(`/${locale}/admin/questions`);

    if (filtered.firstBlockedId) {
        redirect(
            `/${locale}/admin/questions/${filtered.firstBlockedId}/edit?error=PUBLISH_QUALITY_BLOCKED`,
        );
    }

    redirect(`/${locale}/admin/questions`);
}

/**
 * Bulk DRAFT | IN_REVIEW → PUBLISHED.
 * Тот же quality gate + partial success, что у bulk submit-for-review.
 * isActive не меняем (quiz pool = active + PUBLISHED).
 */
export async function publishQuestionsBulkAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionIds = parseBulkQuestionIdsFromFormData(formData);

    if (questionIds.length === 0) {
        redirect(`/${locale}/admin/questions`);
    }

    const filtered = await collectEligibleBulkPublicationIds(questionIds, {
        targetStatus: 'PUBLISHED',
        fromStatuses: ['DRAFT', 'IN_REVIEW'],
    });

    if (!filtered.ok) {
        redirect(`/${locale}/admin/questions?error=PUBLISH_FAILED`);
    }

    if (filtered.eligibleIds.length > 0) {
        try {
            await questionRepository.publishManyByIds(filtered.eligibleIds);
        } catch {
            redirect(`/${locale}/admin/questions?error=PUBLISH_FAILED`);
        }
    }

    revalidatePath(`/${locale}/admin/questions`);

    if (filtered.firstBlockedId) {
        redirect(
            `/${locale}/admin/questions/${filtered.firstBlockedId}/edit?error=PUBLISH_QUALITY_BLOCKED`,
        );
    }

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
 * Публикация вопроса (DRAFT | IN_REVIEW → PUBLISHED).
 * Idempotent: уже PUBLISHED → silent redirect (как activate).
 * Blockers quality → edit + PUBLISH_QUALITY_BLOCKED (warnings OK).
 * Опциональный FormData `returnTo=edit` возвращает на страницу edit.
 */
export async function publishQuestionAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(`/${locale}/admin/questions`);
    }

    const redirectPath = getPublicationRedirectPath(
        formData,
        locale,
        questionId,
    );

    await assertPublishQualityOrRedirect(questionId, locale, {
        skipIfStatus: 'PUBLISHED',
        loadFailedError: 'PUBLISH_FAILED',
        fallbackRedirectPath: redirectPath,
    });

    let result: Awaited<
        ReturnType<typeof questionRepository.publishById>
    > | null = null;

    try {
        result = await questionRepository.publishById(questionId);
    } catch {
        redirectWithOptionalError(redirectPath, 'PUBLISH_FAILED');
    }

    if (!result || result.status === 'not_found') {
        redirectWithOptionalError(redirectPath, 'NOT_FOUND');
    }

    if (result.status === 'invalid_transition') {
        redirectWithOptionalError(
            redirectPath,
            'INVALID_PUBLICATION_TRANSITION',
        );
    }

    revalidatePublicationPaths(
        locale,
        questionId,
        getPublicationReturnTo(formData),
    );
    redirectWithOptionalError(redirectPath);
}

/**
 * Отправка на ревью (DRAFT → IN_REVIEW).
 * Idempotent: уже IN_REVIEW → silent redirect.
 * Тот же quality gate, что у publish (в ревью не пускаем сырой контент).
 * Опциональный FormData `returnTo=edit` возвращает на страницу edit.
 */
export async function submitQuestionForReviewAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(`/${locale}/admin/questions`);
    }

    const redirectPath = getPublicationRedirectPath(
        formData,
        locale,
        questionId,
    );

    await assertPublishQualityOrRedirect(questionId, locale, {
        skipIfStatus: 'IN_REVIEW',
        loadFailedError: 'SUBMIT_FOR_REVIEW_FAILED',
        fallbackRedirectPath: redirectPath,
    });

    let result: Awaited<
        ReturnType<typeof questionRepository.submitForReviewById>
    > | null = null;

    try {
        result = await questionRepository.submitForReviewById(questionId);
    } catch {
        redirectWithOptionalError(
            redirectPath,
            'SUBMIT_FOR_REVIEW_FAILED',
        );
    }

    if (!result || result.status === 'not_found') {
        redirectWithOptionalError(redirectPath, 'NOT_FOUND');
    }

    if (result.status === 'invalid_transition') {
        redirectWithOptionalError(
            redirectPath,
            'INVALID_PUBLICATION_TRANSITION',
        );
    }

    revalidatePublicationPaths(
        locale,
        questionId,
        getPublicationReturnTo(formData),
    );
    redirectWithOptionalError(redirectPath);
}

/**
 * Возврат в черновик (IN_REVIEW | PUBLISHED → DRAFT).
 * Idempotent: уже DRAFT → silent redirect.
 * Снимает из quiz pool даже при isActive=true (pool требует PUBLISHED).
 * Опциональный FormData `returnTo=edit` возвращает на страницу edit.
 */
export async function returnQuestionToDraftAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(`/${locale}/admin/questions`);
    }

    const redirectPath = getPublicationRedirectPath(
        formData,
        locale,
        questionId,
    );

    let result: Awaited<
        ReturnType<typeof questionRepository.returnToDraftById>
    > | null = null;

    try {
        result = await questionRepository.returnToDraftById(questionId);
    } catch {
        redirectWithOptionalError(
            redirectPath,
            'RETURN_TO_DRAFT_FAILED',
        );
    }

    if (!result || result.status === 'not_found') {
        redirectWithOptionalError(redirectPath, 'NOT_FOUND');
    }

    if (result.status === 'invalid_transition') {
        redirectWithOptionalError(
            redirectPath,
            'INVALID_PUBLICATION_TRANSITION',
        );
    }

    revalidatePublicationPaths(
        locale,
        questionId,
        getPublicationReturnTo(formData),
    );
    redirectWithOptionalError(redirectPath);
}

/**
 * Редактирование вопроса.
 * Новый file заменяет prompt URL; старый `/media/...` удаляется best-effort.
 * Rate limit по admin userId — до sharp/Blob и до записи в Neon.
 */
export async function updateQuestionAction(
    _prevState: AdminFormState,
    formData: FormData,
): Promise<AdminFormState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireAdmin(locale);

    const rate = checkPresetRateLimit(
        'upload',
        getUserRateLimitIdentity(session.user.id),
    );
    if (!rate.ok) {
        return { errorCode: 'RATE_LIMITED' };
    }

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
