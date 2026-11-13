/**
 * Серверное событие воронки (`signup`, `guest_merged`) — из кода входа и
 * регистрации. Только сервер.
 *
 * Запись уходит в `after()`: вход не ждёт аналитику, а её сбой не срывает
 * вход (только предупреждение в Sentry без PII). Не вызывать из горячего
 * пути квиза — старт, ответы и сдача в воронке читаются из своих таблиц.
 *
 * Canon: docs/DECISIONS.md → Funnel analytics: own events + existing tables.
 */

import { after } from 'next/server';

import { analyticsEventRepository } from '@/entities/analytics-event/analytics-event.repository';
import { captureAppError } from '@/lib/monitoring/capture-app-error';
import {
    ANALYTICS_SERVER_VISIT_ID,
    type AnalyticsAuthMethod,
    type AnalyticsServerEvent,
} from '@/shared/analytics/events';

async function write(event: AnalyticsServerEvent, userId: string): Promise<void> {
    try {
        await analyticsEventRepository.insertMany([
            {
                name: event.name,
                visitId: ANALYTICS_SERVER_VISIT_ID,
                userId,
                props: event.props,
            },
        ]);
    } catch (error) {
        captureAppError(error, {
            area: 'analytics',
            level: 'warning',
            extra: { event: event.name },
        });
    }
}

export function recordServerEvent(
    event: AnalyticsServerEvent,
    userId: string,
): void {
    try {
        after(() => write(event, userId));
    } catch {
        // Вне запроса (скрипт, тест) after недоступен — пишем без ожидания.
        void write(event, userId);
    }
}

/** id провайдера Auth.js → способ входа для воронки; гость и прочее → null. */
export function authMethodOf(provider: string | undefined): AnalyticsAuthMethod | null {
    switch (provider) {
        case 'credentials':
            return 'password';
        case 'yandex':
            return 'yandex';
        case 'vk':
            return 'vk';
        default:
            return null;
    }
}
