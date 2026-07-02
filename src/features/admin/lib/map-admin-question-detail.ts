import type { Difficulty } from '@/types';
import type { AdminQuestionDetail } from '../types';

// сырой результат findByIdForAdmin (форма select в repository)
type RawAdminQuestionDetailRow = {
    id: string;
    text: string;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    options: Array<{
        id: string;
        text: string;
        isCorrect: boolean;
        order: number;
    }>;
};

// Prisma-строка → DTO для edit-страницы; null если вопрос не найден
export function mapAdminQuestionDetail(
    row: RawAdminQuestionDetailRow | null,
): AdminQuestionDetail | null {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        text: row.text,
        difficulty: row.difficulty,
        category: row.category,
        isActive: row.isActive,
        options: row.options.map((option) => ({
            id: option.id,
            text: option.text,
            isCorrect: option.isCorrect,
            order: option.order,
        })),
    };
}
