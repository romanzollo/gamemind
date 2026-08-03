/**
 * Import пакета draft JSON как publicationStatus=DRAFT.
 *
 * Поток: validate → map → (dry-run | createWithOptions по одному).
 * Никогда не выставляет PUBLISHED — это только admin publish + quality gate.
 *
 * Идемпотентность: каждый успешный import создаёт НОВЫЕ id (UUID).
 * Повторный запуск того же файла = ещё один набор DRAFT-строк.
 *
 * См. docs/CONTENT_PIPELINE.md; DECISIONS → Content Scale Pipeline.
 */

import { questionRepository } from '@/entities/question/question.repository';
import { createQuestionSchema } from '@/features/admin/lib/validation';

import type { DraftQuestionsBatch } from './draft-questions.schema';
import { mapDraftQuestionToCreateInput } from './map-draft-to-create-input';
import {
    validateDraftQuestionsBatch,
    type DraftBatchValidationIssue,
    type DraftQuestionQualityReport,
} from './validate-draft-questions';

export type ImportDraftPlannedItem = {
    index: number;
    draftKey?: string;
    difficulty: DraftQuestionsBatch['questions'][number]['difficulty'];
};

export type ImportDraftCreatedItem = ImportDraftPlannedItem & {
    id: string;
};

export type ImportDraftQuestionsResult =
    | {
          ok: false;
          stage: 'validate';
          issues: DraftBatchValidationIssue[];
      }
    | {
          ok: false;
          stage: 'publish_blockers';
          qualityReports: DraftQuestionQualityReport[];
      }
    | {
          ok: false;
          stage: 'map';
          index: number;
          draftKey?: string;
          message: string;
      }
    | {
          ok: false;
          stage: 'create';
          index: number;
          draftKey?: string;
          message: string;
          createdBeforeFailure: ImportDraftCreatedItem[];
      }
    | {
          ok: true;
          dryRun: true;
          planned: ImportDraftPlannedItem[];
          qualityReports: DraftQuestionQualityReport[];
          hasPublishBlockers: boolean;
      }
    | {
          ok: true;
          dryRun: false;
          created: ImportDraftCreatedItem[];
          qualityReports: DraftQuestionQualityReport[];
          hasPublishBlockers: boolean;
      };

export type ImportDraftQuestionsOptions = {
    /** Только validate + map, без Neon. */
    dryRun?: boolean;
    /** Не импортировать, если есть publish blockers. */
    failOnPublishBlockers?: boolean;
};

/**
 * Принимает уже распарсенный JSON (unknown).
 * Вызывающий CLI обязан загрузить .env до первого create.
 */
export async function importDraftQuestionsBatch(
    input: unknown,
    options: ImportDraftQuestionsOptions = {},
): Promise<ImportDraftQuestionsResult> {
    const dryRun = options.dryRun === true;
    const failOnPublishBlockers = options.failOnPublishBlockers === true;

    const validated = validateDraftQuestionsBatch(input);

    if (!validated.ok) {
        return {
            ok: false,
            stage: 'validate',
            issues: validated.issues,
        };
    }

    if (failOnPublishBlockers && validated.hasPublishBlockers) {
        return {
            ok: false,
            stage: 'publish_blockers',
            qualityReports: validated.qualityReports,
        };
    }

    const planned: ImportDraftPlannedItem[] = validated.batch.questions.map(
        (question, index) => ({
            index,
            draftKey: question.draftKey,
            difficulty: question.difficulty,
        }),
    );

    if (dryRun) {
        // Проверяем map+Zod заранее, чтобы dry-run ловил несовместимость с create
        for (const [index, question] of validated.batch.questions.entries()) {
            const mapped = mapDraftQuestionToCreateInput(question);
            const parsed = createQuestionSchema.safeParse(mapped);

            if (!parsed.success) {
                return {
                    ok: false,
                    stage: 'map',
                    index,
                    draftKey: question.draftKey,
                    message: parsed.error.issues
                        .map((issue) => issue.message)
                        .join('; '),
                };
            }
        }

        return {
            ok: true,
            dryRun: true,
            planned,
            qualityReports: validated.qualityReports,
            hasPublishBlockers: validated.hasPublishBlockers,
        };
    }

    const created: ImportDraftCreatedItem[] = [];

    for (const [index, question] of validated.batch.questions.entries()) {
        const mapped = mapDraftQuestionToCreateInput(question);
        const parsed = createQuestionSchema.safeParse(mapped);

        if (!parsed.success) {
            return {
                ok: false,
                stage: 'map',
                index,
                draftKey: question.draftKey,
                message: parsed.error.issues
                    .map((issue) => issue.message)
                    .join('; '),
            };
        }

        try {
            const row = await questionRepository.createWithOptions(parsed.data);
            created.push({
                index,
                draftKey: question.draftKey,
                difficulty: question.difficulty,
                id: row.id,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown create error';

            return {
                ok: false,
                stage: 'create',
                index,
                draftKey: question.draftKey,
                message,
                createdBeforeFailure: created,
            };
        }
    }

    return {
        ok: true,
        dryRun: false,
        created,
        qualityReports: validated.qualityReports,
        hasPublishBlockers: validated.hasPublishBlockers,
    };
}
