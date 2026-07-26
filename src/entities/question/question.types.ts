/**
 * Публичные типы домена Question (admin edit + quiz snapshot pick).
 *
 * Зачем отдельный файл: §11.7 — репозиторий ~1700 строк делится на admin /
 * quiz-pick; типы остаются общим контрактом, чтобы feature-слой и
 * quiz-session не зависели от того, в каком файле живёт SQL.
 * См. docs/DECISIONS.md → Repository File Split.
 */

import type { Difficulty, QuestionType } from '@/types';

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
    translations: LocalizedAdminText;
    options: Array<{
        id: string;
        isCorrect: boolean;
        order: number;
        translations: LocalizedAdminText;
    }>;
};
