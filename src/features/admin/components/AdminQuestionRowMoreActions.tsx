'use client';

/**
 * Desktop «Ещё»-меню строки списка вопросов.
 *
 * Client + прямой import Server Actions: формы внутри `<details>` надёжнее
 * биндят action, чем RSC-children в Client shell (клик/submit не теряется).
 *
 * Вперёд-шаги взаимоисключающие (как Activate ↔ Deactivate):
 * DRAFT → Отправить на ревью; IN_REVIEW → Опубликовать (+ В черновик).
 */

import {
    activateQuestionAction,
    deactivateQuestionAction,
    deleteQuestionAction,
    publishQuestionAction,
    returnQuestionToDraftAction,
    submitQuestionForReviewAction,
} from '@/features/admin/actions/questions';
import { AdminRowMoreMenu } from '@/features/admin/components/AdminRowMoreMenu';
import type { Dictionary, Locale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';
import type { QuestionPublicationStatus } from '@/types';

const menuActionClassName =
    'inline-flex w-full min-h-8 cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm font-medium motion-safe:transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

type AdminQuestionRowMoreActionsProps = {
    questionId: string;
    publicationStatus: QuestionPublicationStatus;
    isActive: boolean;
    locale: Locale;
    labels: Dictionary['admin'];
    workingLabel: string;
};

function HiddenFields({
    locale,
    questionId,
}: {
    locale: Locale;
    questionId: string;
}) {
    return (
        <>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="questionId" value={questionId} />
        </>
    );
}

export function AdminQuestionRowMoreActions({
    questionId,
    publicationStatus,
    isActive,
    locale,
    labels,
    workingLabel,
}: AdminQuestionRowMoreActionsProps) {
    return (
        <AdminRowMoreMenu label={labels.rowMoreActions}>
            {publicationStatus === 'DRAFT' ? (
                <form
                    action={submitQuestionForReviewAction}
                    className="block w-full"
                >
                    <HiddenFields locale={locale} questionId={questionId} />
                    <SubmitButton
                        unstyled
                        pendingLabel={workingLabel}
                        className={`${menuActionClassName} text-warning hover:opacity-90`}
                    >
                        {labels.submitForReviewButton}
                    </SubmitButton>
                </form>
            ) : null}

            {publicationStatus === 'IN_REVIEW' ? (
                <>
                    <form
                        action={publishQuestionAction}
                        className="block w-full"
                    >
                        <HiddenFields locale={locale} questionId={questionId} />
                        <SubmitButton
                            unstyled
                            pendingLabel={workingLabel}
                            className={`${menuActionClassName} text-success hover:opacity-90`}
                        >
                            {labels.publishButton}
                        </SubmitButton>
                    </form>
                    <form
                        action={returnQuestionToDraftAction}
                        className="block w-full"
                    >
                        <HiddenFields locale={locale} questionId={questionId} />
                        <SubmitButton
                            unstyled
                            pendingLabel={workingLabel}
                            className={`${menuActionClassName} text-warning hover:opacity-90`}
                        >
                            {labels.returnToDraftButton}
                        </SubmitButton>
                    </form>
                </>
            ) : null}

            {publicationStatus === 'PUBLISHED' ? (
                <form
                    action={returnQuestionToDraftAction}
                    className="block w-full"
                >
                    <HiddenFields locale={locale} questionId={questionId} />
                    <SubmitButton
                        unstyled
                        pendingLabel={workingLabel}
                        className={`${menuActionClassName} text-warning hover:opacity-90`}
                    >
                        {labels.returnToDraftButton}
                    </SubmitButton>
                </form>
            ) : null}

            {isActive ? (
                <form
                    action={deactivateQuestionAction}
                    className="block w-full"
                >
                    <HiddenFields locale={locale} questionId={questionId} />
                    <SubmitButton
                        unstyled
                        pendingLabel={workingLabel}
                        className={`${menuActionClassName} text-warning hover:opacity-90`}
                    >
                        {labels.deactivateButton}
                    </SubmitButton>
                </form>
            ) : (
                <form action={activateQuestionAction} className="block w-full">
                    <HiddenFields locale={locale} questionId={questionId} />
                    <SubmitButton
                        unstyled
                        pendingLabel={workingLabel}
                        className={`${menuActionClassName} text-success hover:opacity-90`}
                    >
                        {labels.activateButton}
                    </SubmitButton>
                </form>
            )}

            <form action={deleteQuestionAction} className="block w-full">
                <HiddenFields locale={locale} questionId={questionId} />
                <SubmitButton
                    unstyled
                    pendingLabel={workingLabel}
                    className={`${menuActionClassName} text-danger hover:opacity-90`}
                >
                    {labels.deleteButton}
                </SubmitButton>
            </form>
        </AdminRowMoreMenu>
    );
}
