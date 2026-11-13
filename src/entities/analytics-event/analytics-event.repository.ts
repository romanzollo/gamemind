/**
 * Запись событий воронки (ROADMAP 3.5). Только сервер.
 *
 * Один INSERT на пачку маячка, короткий pooled hop вне Direct-очереди;
 * вызывается из `after()` — ответ браузеру уже ушёл, поэтому сбой здесь
 * никого не ждёт и ничего не ломает. С горячим путём квиза не пересекается:
 * старт, ответы и сдача сюда не пишут, а маячка на странице игры нет.
 *
 * `createdAt` — DEFAULT базы (UTC у Neon), а не JS Date: колонка без часового
 * пояса, и node-pg на Windows сериализовал бы Date как местное время.
 *
 * Canon: docs/DECISIONS.md → Funnel analytics: own events + existing tables.
 */

import type { AnalyticsEventRow } from '@/entities/analytics-event/analytics-event-input';
import { withPooledPgClient } from '@/lib/db/direct-pg';

/** Аналитика — бонус: дольше не держим соединение. */
const ANALYTICS_HOP_TIMEOUT_MS = 4_000;

/** Сколько дней храним события (ADR: 180). */
export const ANALYTICS_RETENTION_DAYS = 180;

/** Потолок строк за одну уборку: удаление не должно стать долгим запросом. */
const PRUNE_BATCH = 5_000;

export const analyticsEventRepository = {
    async insertMany(rows: readonly AnalyticsEventRow[]): Promise<void> {
        if (rows.length === 0) {
            return;
        }

        const values: unknown[] = [];
        const tuples = rows.map((row, index) => {
            const base = index * 4;
            values.push(
                row.name,
                row.visitId,
                row.userId,
                JSON.stringify(row.props),
            );
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb)`;
        });

        await withPooledPgClient(
            (client) =>
                client.query(
                    `INSERT INTO "AnalyticsEvent" ("name", "visitId", "userId", "props")
                     VALUES ${tuples.join(', ')}`,
                    values,
                ),
            {
                debugLabel: 'analytics.insert',
                attemptTimeoutMs: ANALYTICS_HOP_TIMEOUT_MS,
            },
        );
    },

    /**
     * Удаляет события старше срока хранения порциями. Сравнение целиком в SQL
     * (та же часовая зона, что у DEFAULT при записи).
     */
    async pruneExpired(): Promise<void> {
        await withPooledPgClient(
            (client) =>
                client.query(
                    `DELETE FROM "AnalyticsEvent"
                     WHERE "id" IN (
                         SELECT "id" FROM "AnalyticsEvent"
                         WHERE "createdAt" < CURRENT_TIMESTAMP - make_interval(days => $1)
                         LIMIT $2
                     )`,
                    [ANALYTICS_RETENTION_DAYS, PRUNE_BATCH],
                ),
            {
                debugLabel: 'analytics.prune',
                attemptTimeoutMs: ANALYTICS_HOP_TIMEOUT_MS,
            },
        );
    },
};
