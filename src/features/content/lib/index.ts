/**
 * Реэкспорт content-pipeline validate/import (без UI).
 */

export {
    draftQuestionsBatchSchema,
    type DraftQuestion,
    type DraftQuestionsBatch,
} from './draft-questions.schema';

export {
    validateDraftQuestionsBatch,
    type DraftBatchValidationIssue,
    type DraftBatchValidationResult,
    type DraftQuestionQualityReport,
} from './validate-draft-questions';

export { mapDraftQuestionToCreateInput } from './map-draft-to-create-input';

export {
    planDraftImport,
    type DraftImportCandidate,
    type DraftImportDecision,
    type DraftImportSkipReason,
    type ExistingImportRow,
} from './plan-draft-import';

export {
    importDraftQuestionsBatch,
    type ImportDraftCreatedItem,
    type ImportDraftPlannedItem,
    type ImportDraftQuestionsOptions,
    type ImportDraftQuestionsResult,
    type ImportDraftSkippedItem,
} from './import-draft-questions';
