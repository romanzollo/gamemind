/**
 * Публичные типы домена Question (admin edit + quiz snapshot pick).
 *
 * Зачем отдельный файл: §11.7 — репозиторий ~1700 строк делится на admin /
 * quiz-pick; типы остаются общим контрактом, чтобы feature-слой и
 * quiz-session не зависели от того, в каком файле живёт SQL.
 * См. docs/DECISIONS.md → Repository File Split.
 */

import type {
    Difficulty,
    QuestionPublicationStatus,
    QuestionType,
} from '@/types';

/** Кандидат для snapshot: id вопроса + id вариантов (без текстов). */
export type QuestionSnapshotCandidate = {
    id: string;
    options: Array<{ id: string }>;
};

/** Resolved display text одного вопроса для UI / legacy overlay. */
export type QuestionSnapshotDisplayText = {
    questionId: string;
    displayText: string;
    options: Map<string, string>;
};

/** Оба языка в JSON snapshot v2 — locale выбирается при чтении. */
export type LocalizedSnapshotTexts = {
    ru: string;
    en: string;
};

/**
 * Полный bundle для quiz start: тексты RU+EN, image URL, isCorrect.
 * Пишется в QuizSession.snapshotData; scoring читает optionId + isCorrect.
 */
export type QuestionSnapshotBundleItem = {
    id: string;
    difficulty: Difficulty;
    type: QuestionType;
    displayText: string;
    displayTexts: LocalizedSnapshotTexts;
    displayImageUrl: string | null;
    options: Array<{
        id: string;
        displayText: string;
        displayTexts: LocalizedSnapshotTexts;
        isCorrect: boolean;
    }>;
};

/** Тексты вопроса/варианта для admin create/edit (ru + en). */
export type LocalizedAdminText = {
    ru: { text: string };
    en: { text: string };
};

/** Один вопрос со всеми полями для страницы admin edit. */
export type AdminQuestionForEdit = {
    id: string;
    type: QuestionType;
    promptImageUrl: string | null;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    /** Черновик / ревью / опубликован — ортогонально isActive. */
    publicationStatus: QuestionPublicationStatus;
    translations: LocalizedAdminText;
    options: Array<{
        id: string;
        isCorrect: boolean;
        order: number;
        translations: LocalizedAdminText;
    }>;
};

/** Результат смены publicationStatus (как deactivate/activate). */
export type PublicationStatusMutationResult =
    | { status: 'not_found' }
    | { status: 'already_in_target_state' }
    | {
          status: 'invalid_transition';
          from: QuestionPublicationStatus;
          to: QuestionPublicationStatus;
      }
    | { status: 'updated' };

/**
 * Результат bulk-смены isActive (несколько id за один UPDATE).
 *
 * Idempotent: строки уже в целевом состоянии не трогаем (не входят в updatedCount).
 * Несуществующие id тихо пропускаем — не валим всю операцию.
 */
export type BulkIsActiveMutationResult = {
    requestedCount: number;
    updatedCount: number;
};

/**
 * Результат bulk-смены publicationStatus (несколько id за один UPDATE).
 *
 * Та же форма, что BulkIsActiveMutationResult: requested = после normalize/cap;
 * updated = реально изменённые строки. Уже в target / запрещённый переход /
 * несуществующий id → тихо пропускаем (не error).
 * Quality gate — в Server Action до вызова repo (как у single publish).
 */
export type BulkPublicationMutationResult = {
    requestedCount: number;
    updatedCount: number;
};
