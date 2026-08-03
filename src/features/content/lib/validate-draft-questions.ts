/**
 * Validate пакета draft JSON без записи в БД.
 *
 * Два слоя (важно не путать):
 * 1) Contract — Zod (`draftQuestionsBatchSchema`): без этого import нельзя.
 * 2) Publish quality — `getQuestionPublishQualityIssues`: черновик можно
 *    сохранить, но publish/submit-for-review позже упрётся в blockers.
 *
 * См. docs/CONTENT_PIPELINE.md; DECISIONS → Content Scale Pipeline.
 */

import {
    getQuestionPublishQualityIssues,
    hasPublishQualityBlockers,
    type QuestionPublishQualityIssue,
} from '@/features/admin/lib/question-publish-quality';

import {
    draftQuestionsBatchSchema,
    type DraftQuestion,
    type DraftQuestionsBatch,
} from './draft-questions.schema';

export type DraftBatchValidationIssue = {
    /** JSON-path стиль: "questions.0.options" */
    path: string;
    message: string;
};

export type DraftQuestionQualityReport = {
    index: number;
    draftKey?: string;
    issues: QuestionPublishQualityIssue[];
};

export type DraftBatchValidationResult =
    | {
          ok: true;
          batch: DraftQuestionsBatch;
          qualityReports: DraftQuestionQualityReport[];
          /** true, если хотя бы у одного вопроса есть publish blocker */
          hasPublishBlockers: boolean;
      }
    | {
          ok: false;
          issues: DraftBatchValidationIssue[];
      };

function zodPathToString(path: (string | number)[]): string {
    if (path.length === 0) {
        return '(root)';
    }

    return path
        .map((segment, index) => {
            if (typeof segment === 'number') {
                return `[${segment}]`;
            }
            return index === 0 ? segment : `.${segment}`;
        })
        .join('');
}

function toPublishQualityInput(question: DraftQuestion) {
    return {
        type: question.type,
        promptImageUrl: null,
        // Import создаст active+DRAFT; inactive warning не нужен на этапе файла
        isActive: true,
        translations: question.translations,
        options: question.options.map((option) => ({
            isCorrect: option.isCorrect,
            translations: option.translations,
        })),
    };
}

/**
 * Проверяет unknown (обычно JSON.parse результата файла).
 * Не пишет в Neon и не меняет publicationStatus.
 */
export function validateDraftQuestionsBatch(
    input: unknown,
): DraftBatchValidationResult {
    const parsed = draftQuestionsBatchSchema.safeParse(input);

    if (!parsed.success) {
        const issues: DraftBatchValidationIssue[] = parsed.error.issues.map(
            (issue) => ({
                path: zodPathToString(issue.path),
                message: issue.message,
            }),
        );

        return { ok: false, issues };
    }

    const qualityReports: DraftQuestionQualityReport[] =
        parsed.data.questions.map((question, index) => {
            const issues = getQuestionPublishQualityIssues(
                toPublishQualityInput(question),
            );

            return {
                index,
                draftKey: question.draftKey,
                issues,
            };
        });

    const hasBlockers = qualityReports.some((report) =>
        hasPublishQualityBlockers(report.issues),
    );

    return {
        ok: true,
        batch: parsed.data,
        qualityReports,
        hasPublishBlockers: hasBlockers,
    };
}
