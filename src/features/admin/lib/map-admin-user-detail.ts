import type { AdminUserRow } from '@/entities/user/user.repository';
import type { QuizSetupDifficulty } from '@/types';

import type {
    AdminUserDetail,
    AdminUserResultHistoryEntry,
} from '../types';

/**
 * Сырая строка из quizResultRepository.findRecentByUserId.
 * Feature-слой не импортирует pg-типы репозитория напрямую в UI.
 */
type RawAdminUserResultHistoryRow = {
    sessionId: string;
    score: number;
    totalQuestions: number;
    correctCount: number;
    completedAt: Date;
    session: {
        difficulty: QuizSetupDifficulty;
    };
};

/**
 * DB-строка пользователя → DTO карточки админки.
 * Поля совпадают с mapAdminUsers (список и detail не должны разъезжаться).
 */
export function mapAdminUserDetail(row: AdminUserRow): AdminUserDetail {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        role: row.role === 'ADMIN' ? 'ADMIN' : 'USER',
        isActive: row.isActive,
        createdAt:
            row.createdAt instanceof Date
                ? row.createdAt.toISOString()
                : new Date(row.createdAt).toISOString(),
        quizResultCount: row.quizResultCount,
    };
}

/**
 * Последние QuizResult пользователя → DTO для read-only history на admin detail.
 * completedAt сразу в ISO: страница/таблица могут быть Client без сюрпризов с Date.
 */
export function mapAdminUserResultHistory(
    rows: RawAdminUserResultHistoryRow[],
): AdminUserResultHistoryEntry[] {
    return rows.map((row) => ({
        sessionId: row.sessionId,
        score: row.score,
        totalQuestions: row.totalQuestions,
        correctCount: row.correctCount,
        difficulty: row.session.difficulty,
        completedAt:
            row.completedAt instanceof Date
                ? row.completedAt.toISOString()
                : new Date(row.completedAt).toISOString(),
    }));
}
