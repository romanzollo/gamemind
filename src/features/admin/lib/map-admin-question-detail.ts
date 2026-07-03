import type { AdminQuestionForEdit } from '@/entities/question/question.repository';
import type { AdminQuestionDetail } from '../types';

export function mapAdminQuestionDetail(
    row: AdminQuestionForEdit | null,
): AdminQuestionDetail | null {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        translations: row.translations,
        difficulty: row.difficulty,
        category: row.category,
        isActive: row.isActive,
        options: row.options.map((option) => ({
            id: option.id,
            translations: option.translations,
            isCorrect: option.isCorrect,
            order: option.order,
        })),
    };
}
