import type { Difficulty } from '@/types';
import type { AdminQuestionListItem } from '../types';

// тип для строки вопроса из БД
type RawAdminQuestionRow = {
    id: string;
    text: string;
    difficulty: Difficulty;
    category: string;
    isActive: boolean;
    createdAt: Date;
    _count: {
        options: number;
    };
};

// функция для преобразования строк вопросов в список вопросов для админ-панели
export function mapAdminQuestions(
    rows: RawAdminQuestionRow[],
): AdminQuestionListItem[] {
    return rows.map((row) => ({
        id: row.id,
        text: row.text,
        difficulty: row.difficulty,
        category: row.category,
        isActive: row.isActive,
        optionsCount: row._count.options,
        createdAt: row.createdAt,
    }));
}
