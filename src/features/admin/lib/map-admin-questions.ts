import type { Difficulty, QuestionType } from '@/types';
import { normalizeQuizImageUrl } from '@/shared/utils/normalize-quiz-image-url';
import type { AdminQuestionListItem } from '../types';

/** Сырая строка списка из findAllForAdmin (до DTO). */
type RawAdminQuestionRow = {
    id: string;
    text: string;
    type: QuestionType;
    promptImageUrl: string | null;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    createdAt: Date;
    _count: {
        options: number;
    };
};

/** Маппинг admin list: URL нормализуем; type всегда явный. */
export function mapAdminQuestions(
    rows: RawAdminQuestionRow[],
): AdminQuestionListItem[] {
    return rows.map((row) => {
        const type: QuestionType =
            row.type === 'IMAGE_GUESS' ? 'IMAGE_GUESS' : 'TEXT';

        return {
            id: row.id,
            text: row.text,
            type,
            promptImageUrl:
                type === 'IMAGE_GUESS'
                    ? normalizeQuizImageUrl(row.promptImageUrl)
                    : null,
            difficulty: row.difficulty,
            category: row.category,
            isActive: row.isActive,
            optionsCount: row._count.options,
            createdAt: row.createdAt,
        };
    });
}
