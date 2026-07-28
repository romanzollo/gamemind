import {
    publishQuestionAction,
    returnQuestionToDraftAction,
    submitQuestionForReviewAction,
} from '@/features/admin/actions/questions';
import type { Dictionary, Locale } from '@/shared/i18n';
import { SubmitButton } from '@/shared/ui';
import type { QuestionPublicationStatus } from '@/types';

/**
 * Панель жизненного цикла publicationStatus на странице edit.
 *
 * Зачем отдельный блок (не внутри AdminQuestionForm):
 * - сохранение текста/опций не меняет publicationStatus (ADR);
 * - переходы — отдельные Server Actions с idempotent guard;
 * - isActive остаётся на списке (activate/deactivate), здесь только read-only chip.
 *
 * UI = Scoreboard Editorial: surface + badge + semantic button tones.
 * См. DECISIONS.md → Question publication workflow.
 */

type AdminQuestionPublicationControlsProps = {
    questionId: string;
    publicationStatus: QuestionPublicationStatus;
    isActive: boolean;
    locale: Locale;
    labels: Dictionary['admin'];
    workingLabel: string;
};

function publicationStatusLabel(
    status: QuestionPublicationStatus,
    labels: Dictionary['admin'],
): string {
    switch (status) {
        case 'DRAFT':
            return labels.publicationDraft;
        case 'IN_REVIEW':
            return labels.publicationInReview;
        case 'PUBLISHED':
            return labels.publicationPublished;
    }
}

function PublicationBadge({
    status,
    labels,
}: {
    status: QuestionPublicationStatus;
    labels: Dictionary['admin'];
}) {
    const toneClassName =
        status === 'PUBLISHED'
            ? 'text-success'
            : status === 'IN_REVIEW'
              ? 'text-warning'
              : 'text-muted';

    return (
        <span
            className={`inline-flex rounded-sm bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium tracking-wide ${toneClassName}`}
        >
            {publicationStatusLabel(status, labels)}
        </span>
    );
}

export function AdminQuestionPublicationControls({
    questionId,
    publicationStatus,
    isActive,
    locale,
    labels,
    workingLabel,
}: AdminQuestionPublicationControlsProps) {
    // Новый JSX на каждый form — не переиспользовать один fragment (React key).
    const fields = () => (
        <>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="questionId" value={questionId} />
            <input type="hidden" name="returnTo" value="edit" />
        </>
    );

    const actionClassName = 'min-h-10 px-3 text-sm sm:min-h-11';

    return (
        <section
            className="mt-6 rounded-lg border border-border bg-surface p-3 sm:p-4"
            aria-label={labels.tablePublication}
        >
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-sm font-semibold tracking-wide text-foreground uppercase">
                    {labels.tablePublication}
                </h2>
                <PublicationBadge
                    status={publicationStatus}
                    labels={labels}
                />
                <span className="inline-flex rounded-sm bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted">
                    {isActive ? labels.statusActive : labels.statusInactive}
                </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                {publicationStatus === 'DRAFT' ? (
                    <>
                        <form action={submitQuestionForReviewAction}>
                            {fields()}
                            <SubmitButton
                                variant="secondary"
                                pendingLabel={workingLabel}
                                className={`${actionClassName} text-warning`}
                            >
                                {labels.submitForReviewButton}
                            </SubmitButton>
                        </form>
                        <form action={publishQuestionAction}>
                            {fields()}
                            <SubmitButton
                                pendingLabel={workingLabel}
                                className={actionClassName}
                            >
                                {labels.publishButton}
                            </SubmitButton>
                        </form>
                    </>
                ) : null}

                {publicationStatus === 'IN_REVIEW' ? (
                    <>
                        <form action={publishQuestionAction}>
                            {fields()}
                            <SubmitButton
                                pendingLabel={workingLabel}
                                className={actionClassName}
                            >
                                {labels.publishButton}
                            </SubmitButton>
                        </form>
                        <form action={returnQuestionToDraftAction}>
                            {fields()}
                            <SubmitButton
                                variant="secondary"
                                pendingLabel={workingLabel}
                                className={`${actionClassName} text-warning`}
                            >
                                {labels.returnToDraftButton}
                            </SubmitButton>
                        </form>
                    </>
                ) : null}

                {publicationStatus === 'PUBLISHED' ? (
                    <form action={returnQuestionToDraftAction}>
                        {fields()}
                        <SubmitButton
                            variant="secondary"
                            pendingLabel={workingLabel}
                            className={`${actionClassName} text-warning`}
                        >
                            {labels.returnToDraftButton}
                        </SubmitButton>
                    </form>
                ) : null}
            </div>
        </section>
    );
}
