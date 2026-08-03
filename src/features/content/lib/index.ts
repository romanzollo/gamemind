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
    importDraftQuestionsBatch,
    type ImportDraftCreatedItem,
    type ImportDraftPlannedItem,
    type ImportDraftQuestionsOptions,
    type ImportDraftQuestionsResult,
} from './import-draft-questions';
