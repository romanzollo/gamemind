import type { AdminUserRow } from '@/entities/user/user.repository';
import type { AdminUserListItem } from '../types';

/** Маппинг DB-строки → DTO админ-списка (без passwordHash). */
export function mapAdminUsers(rows: AdminUserRow[]): AdminUserListItem[] {
    return rows.map((row) => ({
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
    }));
}
