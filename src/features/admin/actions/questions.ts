'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ZodError } from 'zod';

import { questionRepository } from '@/entities/question/question.repository';
import {
    ADMIN_QUESTION_LIST_BACK_PARAM,
    buildAdminQuestionEditHref,
    buildAdminQuestionListHrefFromBack,
    parseAdminQuestionListBack,
    withAdminErrorParam,
} from '@/features/admin/lib/admin-question-list-back';
import { parseBulkQuestionIdsFromFormData } from '@/features/admin/lib/parse-bulk-question-ids';
import { appendAdminNotice } from '@/features/admin/lib/parse-admin-notice';
import {
    getQuestionPublishQualityIssues,
    hasPublishQualityBlockers,
} from '@/features/admin/lib/question-publish-quality';
import {
    getPromptAudioFile,
    resolveAdminPromptAudio,
} from '@/features/admin/lib/resolve-prompt-audio';
import {
    getPromptImageFile,
    resolveAdminPromptImage,
    type ResolveAdminPromptImageResult,
} from '@/features/admin/lib/resolve-prompt-image';
import {
    createQuestionSchema,
    updateQuestionSchema,
} from '@/features/admin/lib/validation';
import type {
    AdminBulkActionResult,
    AdminFormState,
} from '@/features/admin/types';
import { requireAdmin } from '@/lib/auth/guards';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import { checkSharedPresetRateLimit } from '@/lib/rate-limit-shared';
import { getUserRateLimitIdentity } from '@/lib/rate-limit-key';
import {
    deleteReplacedMediaObject,
    getMediaStorage,
    isQuizAudioPublicUrl,
    quizMediaOwner,
    storageKeyFromPublicUrl,
} from '@/lib/storage';
import { defaultLocale, isLocale, type Locale } from '@/shared/i18n';

function getLocaleFromFormData(formData: FormData): Locale {
    const locale = formData.get('locale');

    return typeof locale === 'string' && isLocale(locale)
        ? locale
        : defaultLocale;
}

/** Нормализованный query списка из формы (см. admin-question-list-back). */
function getListBack(formData: FormData): string {
    return parseAdminQuestionListBack(
        formData.get(ADMIN_QUESTION_LIST_BACK_PARAM),
    );
}

/** Тот же список (фильтры + страница), откуда пришло действие. */
function getListReturnPath(formData: FormData, locale: Locale): string {
    return buildAdminQuestionListHrefFromBack(
        locale,
        formData.get(ADMIN_QUESTION_LIST_BACK_PARAM),
    );
}

/**
 * Куда вернуть после publication action.
 * `returnTo=edit` — остаёмся на странице edit (кнопки панели редактирования);
 * иначе тот же список, откуда нажали (кнопки в таблице).
 */
function getPublicationRedirectPath(
    formData: FormData,
    locale: Locale,
    questionId: string,
): string {
    const returnTo = formData.get('returnTo');

    if (returnTo === 'edit') {
        return buildAdminQuestionEditHref(
            locale,
            questionId,
            getListBack(formData),
        );
    }

    return getListReturnPath(formData, locale);
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

    redirect(withAdminErrorParam(path, error));
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
        /** Query списка — чтобы из редактора можно было вернуться на место. */
        back: string;
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
            withAdminErrorParam(
                buildAdminQuestionEditHref(locale, questionId, options.back),
                'PUBLISH_QUALITY_BLOCKED',
            ),
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

/**
 * Код ошибки формы create/edit по Zod issues.
 *
 * EXACTLY_ONE_CORRECT_REQUIRED — только superRefine «ровно один правильный»
 * (path === ['options'], code custom). Ошибки внутри варианта (пустой EN,
 * >200 символов) → INVALID_INPUT, чтобы админ не искал проблему
 * в выборе правильного ответа.
 */
function getQuestionFormErrorCode(
    error: ZodError,
): 'EXACTLY_ONE_CORRECT_REQUIRED' | 'INVALID_INPUT' {
    const hasCorrectOptionError = error.issues.some(
        (issue) =>
            issue.code === 'custom' &&
            issue.path.length === 1 &&
            issue.path[0] === 'options',
    );

    return hasCorrectOptionError
        ? 'EXACTLY_ONE_CORRECT_REQUIRED'
        : 'INVALID_INPUT';
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

type AdminQuestionFormType = 'TEXT' | 'IMAGE_GUESS' | 'AUDIO_GUESS';

/**
 * Тип вопроса из формы; медиа резолвит resolveAdminPromptMedia.
 * Неизвестное значение → TEXT (как раньше), но AUDIO_GUESS — свой тип:
 * иначе сохранение аудиовопроса превращало бы его в текстовый и
 * отвязывало клип.
 */
function parseQuestionTypeFromFormData(
    formData: FormData,
): AdminQuestionFormType {
    const typeRaw = getFormString(formData, 'questionType');

    if (typeRaw === 'IMAGE_GUESS' || typeRaw === 'AUDIO_GUESS') {
        return typeRaw;
    }

    return 'TEXT';
}

/** Подпись трека AUDIO_GUESS из формы (только для этого типа). */
function parseAudioCreditFromFormData(
    formData: FormData,
    type: AdminQuestionFormType,
) {
    if (type !== 'AUDIO_GUESS') {
        return undefined;
    }

    return {
        track: getFormString(formData, 'audioTrack'),
        composer: getFormString(formData, 'audioComposer'),
        performer: getFormString(formData, 'audioPerformer'),
        source: getFormString(formData, 'audioSource'),
    };
}

/** Есть ли в форме новый файл (картинка или клип) — для rate limit `upload`. */
function hasPromptMediaFile(
    formData: FormData,
    type: AdminQuestionFormType,
): boolean {
    return type === 'AUDIO_GUESS'
        ? getPromptAudioFile(formData) !== null
        : getPromptImageFile(formData, type) !== null;
}

/** PROMPT-медиа по типу: клип AUDIO_GUESS или картинка IMAGE_GUESS. */
async function resolveAdminPromptMedia(options: {
    formData: FormData;
    type: AdminQuestionFormType;
    questionIdForKey: string;
}): Promise<
    | ResolveAdminPromptImageResult
    | Awaited<ReturnType<typeof resolveAdminPromptAudio>>
> {
    if (options.type === 'AUDIO_GUESS') {
        return resolveAdminPromptAudio(options.formData);
    }

    return resolveAdminPromptImage(options);
}

/**
 * Best-effort удаление заменённого клипа — после успешного UPDATE.
 * Клип назван по содержимому и может быть у другого вопроса: удаляем,
 * только если на него больше не ссылается ни один ассет. Ошибку глотаем —
 * сохранение уже прошло, лишний файл безопаснее битой ссылки.
 */
async function deleteReplacedQuizAudio(options: {
    previousPublicUrl: string | null;
    nextPublicUrl: string | null;
}): Promise<void> {
    const previousUrl = options.previousPublicUrl?.trim();

    if (
        !previousUrl ||
        !isQuizAudioPublicUrl(previousUrl) ||
        previousUrl === options.nextPublicUrl?.trim()
    ) {
        return;
    }

    const key = storageKeyFromPublicUrl(previousUrl);
    if (!key) {
        return;
    }

    try {
        if (await questionRepository.isAssetUrlInUse(previousUrl)) {
            return;
        }
        await getMediaStorage().delete({ key });
    } catch (error) {
        console.warn('[storage] delete replaced clip failed:', key, error);
    }
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
 * Rate limit admin create/update по userId — до sharp/Blob и до записи в Neon.
 * `adminWrite` тратится на каждое сохранение, `upload` — только если приложен
 * файл: текстовая редактура не должна упираться в лимит дорогих загрузок.
 */
async function consumeAdminQuestionWriteRateLimit(
    userId: string,
    hasMediaFile: boolean,
): Promise<boolean> {
    const identity = getUserRateLimitIdentity(userId);

    if (!(await checkSharedPresetRateLimit('adminWrite', identity)).ok) {
        return false;
    }

    return (
        !hasMediaFile ||
        (await checkSharedPresetRateLimit('upload', identity)).ok
    );
}

/**
 * Создание вопроса.
 * Для IMAGE_GUESS: file → sharp → storage.put → URL в QuestionAsset (или URL-поле).
 * Для AUDIO_GUESS: MP3 → sanitizeQuizMp3 → storage.put (имя по содержимому).
 * Упавший INSERT после upload оставляет orphan-объект в storage — безопасно
 * (битых ссылок нет), чистка сирот отдельно.
 */
export async function createQuestionAction(
    _prevState: AdminFormState,
    formData: FormData,
): Promise<AdminFormState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireAdmin(locale);
    const type = parseQuestionTypeFromFormData(formData);

    if (
        !(await consumeAdminQuestionWriteRateLimit(
            session.user.id,
            hasPromptMediaFile(formData, type),
        ))
    ) {
        return { errorCode: 'RATE_LIMITED' };
    }

    // id заранее — совпадает со storage key до INSERT
    const questionId = randomUUID();

    const resolved = await resolveAdminPromptMedia({
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
        audioCredit: parseAudioCreditFromFormData(formData, type),
        translations: parseQuestionTranslationsFromFormData(formData),
        difficulty: formData.get('difficulty'),
        category: formData.get('category') ?? 'video-games',
        options: parseOptionsFromFormData(formData),
    });

    if (!parsed.success) {
        return { errorCode: getQuestionFormErrorCode(parsed.error) };
    }

    try {
        await questionRepository.createWithOptions(parsed.data);
    } catch (error) {
        // Всегда в Runtime Logs: на prod иначе SAVE_FAILED без причины.
        console.error('createQuestionAction failed:', error);
        captureAppError(error, {
            area: 'admin-question',
            extra: { action: 'create' },
        });
        return { errorCode: 'SAVE_FAILED' };
    }

    revalidatePath(`/${locale}/admin/questions`);
    redirect(
        appendAdminNotice(
            `/${locale}/admin/questions`,
            'question_saved',
        ),
    );
}

/**
 * Soft-hide одного вопроса. Успех без redirect — soft revalidate
 * сохраняет scroll списка (как bulk).
 */
export async function deactivateQuestionAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(getListReturnPath(formData, locale));
    }

    let result: Awaited<
        ReturnType<typeof questionRepository.deactivateById>
    > | null = null;

    try {
        result = await questionRepository.deactivateById(questionId);
    } catch {
        redirect(withAdminErrorParam(getListReturnPath(formData, locale), 'DEACTIVATE_FAILED'));
    }

    if (!result || result.status === 'not_found') {
        redirect(withAdminErrorParam(getListReturnPath(formData, locale), 'NOT_FOUND'));
    }

    revalidatePath(`/${locale}/admin/questions`);
}

/**
 * Single-row restore в витрину. Успех без redirect — soft revalidate
 * сохраняет scroll списка (как bulk).
 */
export async function activateQuestionAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(getListReturnPath(formData, locale));
    }

    let result: Awaited<
        ReturnType<typeof questionRepository.activateById>
    > | null = null;

    try {
        result = await questionRepository.activateById(questionId);
    } catch {
        redirect(withAdminErrorParam(getListReturnPath(formData, locale), 'ACTIVATE_FAILED'));
    }

    if (!result || result.status === 'not_found') {
        redirect(withAdminErrorParam(getListReturnPath(formData, locale), 'NOT_FOUND'));
    }

    revalidatePath(`/${locale}/admin/questions`);
}

/**
 * Bulk soft-hide: несколько questionIds → isActive=false.
 * Успех без redirect — client toast + router.refresh (scroll на месте).
 * Idempotent: уже inactive не ломают операцию.
 */
export async function deactivateQuestionsBulkAction(
    formData: FormData,
): Promise<AdminBulkActionResult> {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionIds = parseBulkQuestionIdsFromFormData(formData);

    if (questionIds.length === 0) {
        return { status: 'skipped' };
    }

    try {
        await questionRepository.deactivateManyByIds(questionIds);
    } catch {
        return { status: 'error', errorCode: 'DEACTIVATE_FAILED' };
    }

    revalidatePath(`/${locale}/admin/questions`);
    return { status: 'ok', notice: 'bulk_deactivated' };
}

/**
 * Bulk restore в витрину: несколько questionIds → isActive=true.
 * publicationStatus не меняем. Успех без redirect (scroll на месте).
 */
export async function activateQuestionsBulkAction(
    formData: FormData,
): Promise<AdminBulkActionResult> {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionIds = parseBulkQuestionIdsFromFormData(formData);

    if (questionIds.length === 0) {
        return { status: 'skipped' };
    }

    try {
        await questionRepository.activateManyByIds(questionIds);
    } catch {
        return { status: 'error', errorCode: 'ACTIVATE_FAILED' };
    }

    revalidatePath(`/${locale}/admin/questions`);
    return { status: 'ok', notice: 'bulk_activated' };
}

/**
 * Bulk DRAFT → IN_REVIEW для выбранных id.
 * Quality blockers → eligible всё равно уходят в UPDATE; первый blocked
 * открываем на edit (redirect). Иначе ok без redirect.
 */
export async function submitQuestionsForReviewBulkAction(
    formData: FormData,
): Promise<AdminBulkActionResult> {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionIds = parseBulkQuestionIdsFromFormData(formData);

    if (questionIds.length === 0) {
        return { status: 'skipped' };
    }

    const filtered = await collectEligibleBulkPublicationIds(questionIds, {
        targetStatus: 'IN_REVIEW',
        fromStatuses: ['DRAFT'],
    });

    if (!filtered.ok) {
        return { status: 'error', errorCode: 'SUBMIT_FOR_REVIEW_FAILED' };
    }

    if (filtered.eligibleIds.length > 0) {
        try {
            await questionRepository.submitForReviewManyByIds(
                filtered.eligibleIds,
            );
        } catch {
            return { status: 'error', errorCode: 'SUBMIT_FOR_REVIEW_FAILED' };
        }
    }

    revalidatePath(`/${locale}/admin/questions`);

    if (filtered.firstBlockedId) {
        redirect(
            `/${locale}/admin/questions/${filtered.firstBlockedId}/edit?error=PUBLISH_QUALITY_BLOCKED`,
        );
    }

    return { status: 'ok', notice: 'bulk_submitted' };
}

/**
 * Bulk DRAFT | IN_REVIEW → PUBLISHED.
 * Тот же quality gate + partial success, что у bulk submit-for-review.
 * isActive не меняем (quiz pool = active + PUBLISHED).
 */
export async function publishQuestionsBulkAction(
    formData: FormData,
): Promise<AdminBulkActionResult> {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionIds = parseBulkQuestionIdsFromFormData(formData);

    if (questionIds.length === 0) {
        return { status: 'skipped' };
    }

    const filtered = await collectEligibleBulkPublicationIds(questionIds, {
        targetStatus: 'PUBLISHED',
        fromStatuses: ['DRAFT', 'IN_REVIEW'],
    });

    if (!filtered.ok) {
        return { status: 'error', errorCode: 'PUBLISH_FAILED' };
    }

    if (filtered.eligibleIds.length > 0) {
        try {
            await questionRepository.publishManyByIds(filtered.eligibleIds);
        } catch {
            return { status: 'error', errorCode: 'PUBLISH_FAILED' };
        }
    }

    revalidatePath(`/${locale}/admin/questions`);

    if (filtered.firstBlockedId) {
        redirect(
            `/${locale}/admin/questions/${filtered.firstBlockedId}/edit?error=PUBLISH_QUALITY_BLOCKED`,
        );
    }

    return { status: 'ok', notice: 'bulk_published' };
}

export async function deleteQuestionAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(getListReturnPath(formData, locale));
    }

    try {
        await questionRepository.deleteById(questionId);
    } catch {
        redirect(withAdminErrorParam(getListReturnPath(formData, locale), 'DELETE_FAILED'));
    }

    revalidatePath(`/${locale}/admin/questions`);
}

/**
 * Публикация вопроса (DRAFT | IN_REVIEW → PUBLISHED).
 * Idempotent: уже PUBLISHED → soft revalidate без redirect.
 * Blockers quality → edit + PUBLISH_QUALITY_BLOCKED (warnings OK).
 * Успех без redirect — scroll списка/edit на месте.
 */
export async function publishQuestionAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(getListReturnPath(formData, locale));
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
        back: getListBack(formData),
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
}

/**
 * Отправка на ревью (DRAFT → IN_REVIEW).
 * Idempotent: уже IN_REVIEW → soft revalidate без redirect.
 * Тот же quality gate, что у publish (в ревью не пускаем сырой контент).
 * Успех без redirect — scroll на месте.
 */
export async function submitQuestionForReviewAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(getListReturnPath(formData, locale));
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
        back: getListBack(formData),
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
}

/**
 * Возврат в черновик (IN_REVIEW | PUBLISHED → DRAFT).
 * Idempotent: уже DRAFT → soft revalidate без redirect.
 * Снимает из quiz pool даже при isActive=true (pool требует PUBLISHED).
 * Успех без redirect — scroll на месте.
 */
export async function returnQuestionToDraftAction(formData: FormData) {
    const locale = getLocaleFromFormData(formData);
    await requireAdmin(locale);

    const questionId = formData.get('questionId');

    if (typeof questionId !== 'string' || questionId.trim() === '') {
        redirect(getListReturnPath(formData, locale));
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
}

/**
 * Редактирование вопроса.
 * Новый file / URL заменяет prompt; заменённый собственный `/media/quiz/...`
 * удаляется best-effort ТОЛЬКО после успешного UPDATE. Прежний URL берём
 * из БД (результат UPDATE), не из формы: клиенту не доверяем цель delete,
 * и при смене IMAGE_GUESS → TEXT поле картинки в форме не отправляется.
 * Заменённый клип AUDIO_GUESS удаляется, только если он больше ничей.
 */
export async function updateQuestionAction(
    _prevState: AdminFormState,
    formData: FormData,
): Promise<AdminFormState> {
    const locale = getLocaleFromFormData(formData);
    const session = await requireAdmin(locale);
    const type = parseQuestionTypeFromFormData(formData);

    if (
        !(await consumeAdminQuestionWriteRateLimit(
            session.user.id,
            hasPromptMediaFile(formData, type),
        ))
    ) {
        return { errorCode: 'RATE_LIMITED' };
    }

    const questionIdRaw = formData.get('questionId');
    if (typeof questionIdRaw !== 'string' || questionIdRaw.trim() === '') {
        return { errorCode: 'INVALID_INPUT' };
    }
    const questionId = questionIdRaw.trim();

    const resolved = await resolveAdminPromptMedia({
        formData,
        type,
        questionIdForKey: questionId,
    });

    if (!resolved.ok) {
        return { errorCode: resolved.errorCode };
    }

    const parsed = updateQuestionSchema.safeParse({
        questionId,
        type,
        promptImageUrl: resolved.value.promptImageUrl,
        promptAsset: resolved.value.promptAsset,
        audioCredit: parseAudioCreditFromFormData(formData, type),
        translations: parseQuestionTranslationsFromFormData(formData),
        difficulty: formData.get('difficulty'),
        category: formData.get('category') ?? 'video-games',
        options: parseOptionsForUpdateFromFormData(formData),
    });

    if (!parsed.success) {
        return { errorCode: getQuestionFormErrorCode(parsed.error) };
    }

    let updated: Awaited<
        ReturnType<typeof questionRepository.updateWithOptions>
    >;

    try {
        updated = await questionRepository.updateWithOptions(parsed.data);
    } catch (error) {
        // Всегда в Runtime Logs: на prod иначе SAVE_FAILED без причины.
        console.error('updateQuestionAction failed:', error);
        captureAppError(error, {
            area: 'admin-question',
            extra: { action: 'update', questionId },
        });

        return { errorCode: 'SAVE_FAILED' };
    }

    if (!updated) {
        return { errorCode: 'NOT_FOUND' };
    }

    const nextPromptUrl =
        parsed.data.type === 'TEXT' ? null : (parsed.data.promptImageUrl ?? null);

    await deleteReplacedMediaObject({
        previousPublicUrl: updated.previousPromptImageUrl,
        nextPublicUrl: nextPromptUrl,
        owner: quizMediaOwner(questionId),
    });
    await deleteReplacedQuizAudio({
        previousPublicUrl: updated.previousPromptImageUrl,
        nextPublicUrl: nextPromptUrl,
    });

    revalidatePath(`/${locale}/admin/questions`);
    revalidatePath(`/${locale}/admin/questions/${parsed.data.questionId}/edit`);
    // Назад в тот же список (фильтры + страница), а не на первую страницу.
    redirect(
        appendAdminNotice(getListReturnPath(formData, locale), 'question_saved'),
    );
}
