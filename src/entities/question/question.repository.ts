/**
 * Question repository facade (§11.7).
 *
 * Стабильная точка импорта для features / quiz-session / admin pages:
 * типы, warmAdminListConnection, load*, questionRepository.
 * Реализация: question.types.ts + question-quiz-pick + question-admin.
 * См. docs/DECISIONS.md → Repository File Split.
 */

import {
    questionAdminMethods,
    warmAdminListConnection,
} from '@/entities/question/question-admin.repository';
import {
    loadLocalizedTextsByQuestionIds,
    loadRandomSnapshotBundleWithPgClient,
    questionQuizPickMethods,
} from '@/entities/question/question-quiz-pick.repository';

export type {
    AdminQuestionForEdit,
    BulkIsActiveMutationResult,
    LocalizedAdminText,
    LocalizedSnapshotTexts,
    PublicationStatusMutationResult,
    QuestionSnapshotBundleItem,
    QuestionSnapshotCandidate,
    QuestionSnapshotDisplayText,
} from '@/entities/question/question.types';

export { warmAdminListConnection };

export {
    loadLocalizedTextsByQuestionIds,
    loadRandomSnapshotBundleWithPgClient,
};

export const questionRepository = {
    ...questionQuizPickMethods,
    ...questionAdminMethods,
};
