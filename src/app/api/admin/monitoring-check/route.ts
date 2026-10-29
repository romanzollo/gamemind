/**
 * Проверка мониторинга с сервера: админ жмёт кнопку на admin hub →
 * тестовое событие уходит в Sentry, в ответ — его id для поиска в Sentry.
 *
 * Только ADMIN: роль сверяем по БД (JWT может устареть). POST, а не GET —
 * prefetch и краулеры не создают события. `flushMonitoring` здесь осознанно:
 * админ ждёт подтверждение, что событие реально ушло.
 */

import { NextResponse } from 'next/server';

import { userRepository } from '@/entities/user/user.repository';
import { auth } from '@/lib/auth';
import {
    captureAppError,
    flushMonitoring,
    isMonitoringEnabled,
} from '@/lib/monitoring/capture-app-error';

export async function POST() {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const user = await userRepository.findSessionUserById(userId);

    if (!user?.isActive || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    if (!isMonitoringEnabled()) {
        return NextResponse.json({ enabled: false });
    }

    const eventId = captureAppError(
        new Error(`Monitoring check (server) ${new Date().toISOString()}`),
        { area: 'monitoring-check', level: 'warning' },
    );
    const delivered = await flushMonitoring();

    return NextResponse.json({ enabled: true, eventId, delivered });
}
