import Link from 'next/link';
import { notFound } from 'next/navigation';

import { questionRepository } from '@/entities/question/question.repository';
import {
    questionTagsRepository,
    type AdminTagOption,
} from '@/entities/question/question-tags.repository';
import { AdminQuestionForm } from '@/features/admin/components/AdminQuestionForm';
import { AdminQuestionPublicationControls } from '@/features/admin/components/AdminQuestionPublicationControls';
import { AdminQuestionPublishQualityPanel } from '@/features/admin/components/AdminQuestionPublishQualityPanel';
import { AdminQuestionTags } from '@/features/admin/components/AdminQuestionTags';
import {
    buildAdminQuestionEditHref,
    buildAdminQuestionListHrefFromBack,
    getAdminErrorMessage,
    parseAdminQuestionListBack,
    getQuestionPublishQualityIssues,
    mapAdminQuestionDetail,
} from '@/features/admin/lib';
import type { AdminErrorCode } from '@/features/admin/types';
import { requireAdmin } from '@/lib/auth/guards';
import { getDictionary, isLocale } from '@/shared/i18n';
import { buttonClassName, InlineAlert } from '@/shared/ui';

type AdminEditQuestionPageProps = {
    params: Promise<{ locale: string; id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** URL ?error= только из allowlist — чужой query не мапится в сообщение. */
const ADMIN_EDIT_ERROR_CODES = new Set<string>([
    'PUBLISH_FAILED',
    'SUBMIT_FOR_REVIEW_FAILED',
    'RETURN_TO_DRAFT_FAILED',
    'INVALID_PUBLICATION_TRANSITION',
    'NOT_FOUND',
    'PUBLISH_QUALITY_BLOCKED',
]);

export default async function AdminEditQuestionPage({
    params,
    searchParams,
}: AdminEditQuestionPageProps) {
    const { locale, id } = await params;
    const rawSearchParams = await searchParams;
    const safeLocale = isLocale(locale) ? locale : 'ru';
    const dictionary = getDictionary(safeLocale);

    await requireAdmin(safeLocale);

    // Откуда пришли в редактор: «Вопросы» и сохранение ведут туда же.
    const listBack = parseAdminQuestionListBack(rawSearchParams.back);
    const listHref = buildAdminQuestionListHrefFromBack(safeLocale, listBack);
    const editHref = buildAdminQuestionEditHref(safeLocale, id, listBack);

    const header = (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {dictionary.admin.editTitle}
            </h1>
            <Link
                href={listHref}
                prefetch={false}
                className={buttonClassName({
                    variant: 'secondary',
                    className: 'min-h-10 px-3 text-sm sm:min-h-11',
                })}
            >
                {dictionary.admin.questionsLink}
            </Link>
        </div>
    );

    // Вопрос, его метки и каталог меток — параллельно, три независимых
    // чтения (на проде — три соединения сразу, а не одно за другим; в
    // `next dev` общая очередь Direct всё равно выстроит их по одному).
    // Метки — soft-fail: без них вопрос всё равно редактируется.
    const tagsPromise = Promise.all([
        questionTagsRepository.findTagsForQuestion(id),
        questionTagsRepository.findAllTagOptions(),
    ]).catch((tagsError: unknown) => {
        console.warn(
            '[admin/questions/edit] tags load failed:',
            tagsError instanceof Error ? tagsError.message : tagsError,
        );
        return null;
    });

    // Transient Neon read (DirectPgTimeout / Connection terminated) ≠ «вопроса нет»:
    // ловим и показываем InlineAlert + retry, иначе исключение уходит в дефолтную
    // ошибку Next (redbox в dev, «Application error» на prod).
    // notFound() — только для реального null (вопрос удалён).
    let rawQuestion: Awaited<
        ReturnType<typeof questionRepository.findByIdForAdmin>
    > = null;
    let loadFailed = false;

    try {
        rawQuestion = await questionRepository.findByIdForAdmin(id);
    } catch (loadError) {
        // console.warn: console.error в Server Component поднимает Next redbox
        // даже когда ошибка уже обработана (InlineAlert + retry).
        console.warn(
            '[admin/questions/edit] findByIdForAdmin failed:',
            loadError instanceof Error ? loadError.message : loadError,
        );
        loadFailed = true;
    }

    if (loadFailed) {
        return (
            <main className="mx-auto max-w-4xl px-4 py-5 sm:px-8 sm:py-10">
                {header}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <InlineAlert>
                        {dictionary.admin.errors.questionLoadFailed}
                    </InlineAlert>
                    <Link
                        href={editHref}
                        prefetch={false}
                        className="rounded-sm text-sm font-medium text-primary underline-offset-2 hover:underline hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                        {dictionary.admin.retryLoad}
                    </Link>
                </div>
            </main>
        );
    }

    const question = mapAdminQuestionDetail(rawQuestion);
    if (!question) {
        notFound();
    }

    const error = Array.isArray(rawSearchParams.error)
        ? rawSearchParams.error[0]
        : rawSearchParams.error;

    const errorCode =
        typeof error === 'string' && ADMIN_EDIT_ERROR_CODES.has(error)
            ? (error as AdminErrorCode)
            : undefined;
    const actionErrorMessage = getAdminErrorMessage(dictionary, errorCode);

    const qualityIssues = getQuestionPublishQualityIssues(question);

    const tagsResult = await tagsPromise;
    const questionTags: AdminTagOption[] | null = tagsResult
        ? tagsResult[0]
        : null;
    const tagOptions: AdminTagOption[] = tagsResult ? tagsResult[1] : [];

    return (
        <main className="mx-auto max-w-4xl px-4 py-5 sm:px-8 sm:py-10">
            {header}

            {actionErrorMessage ? (
                <div className="mt-4">
                    <InlineAlert>{actionErrorMessage}</InlineAlert>
                </div>
            ) : null}

            <AdminQuestionPublishQualityPanel
                issues={qualityIssues}
                dictionary={dictionary}
            />

            <AdminQuestionPublicationControls
                questionId={question.id}
                publicationStatus={question.publicationStatus}
                isActive={question.isActive}
                locale={safeLocale}
                labels={dictionary.admin}
                workingLabel={dictionary.common.working}
                listBack={listBack}
            />

            {questionTags ? (
                <AdminQuestionTags
                    locale={safeLocale}
                    questionId={question.id}
                    tags={questionTags}
                    options={tagOptions}
                    labels={dictionary.admin.tags}
                    workingLabel={dictionary.common.working}
                />
            ) : null}

            <AdminQuestionForm
                locale={safeLocale}
                dictionary={dictionary}
                mode="edit"
                initialValues={question}
                listBack={listBack}
            />
        </main>
    );
}
