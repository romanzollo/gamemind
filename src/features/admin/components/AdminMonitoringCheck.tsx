'use client';

/**
 * Проверка мониторинга на admin hub: две тестовые ошибки.
 *
 * - «С сервера» — POST /api/admin/monitoring-check (только ADMIN): проверяет
 *   серверный SDK и DSN в окружении функции.
 * - «Из браузера» — событие из клиента: проверяет клиентский SDK и туннель
 *   `/api/m` (то, что ломается блокировщиками и сетями РФ).
 *
 * Показываем id события — по нему его ищут в Sentry (Issues → поиск).
 */

import { useState } from 'react';

import { checkBrowserMonitoring } from '@/lib/monitoring/sentry-browser';
import type { Dictionary } from '@/shared/i18n';
import { Button } from '@/shared/ui';

type CheckStatus =
    | { kind: 'idle' }
    | { kind: 'pending' }
    | { kind: 'sent'; eventId: string }
    | { kind: 'disabled' }
    | { kind: 'failed' };

type MonitoringCheckResponse = {
    enabled?: boolean;
    eventId?: string;
    delivered?: boolean;
};

type AdminMonitoringCheckProps = {
    labels: Dictionary['admin']['monitoring'];
};

export function AdminMonitoringCheck({ labels }: AdminMonitoringCheckProps) {
    const [status, setStatus] = useState<CheckStatus>({ kind: 'idle' });

    async function checkServer() {
        setStatus({ kind: 'pending' });

        try {
            const response = await fetch('/api/admin/monitoring-check', {
                method: 'POST',
            });
            const body = (await response.json()) as MonitoringCheckResponse;

            if (!response.ok) {
                setStatus({ kind: 'failed' });
            } else if (body.enabled === false) {
                setStatus({ kind: 'disabled' });
            } else if (body.eventId && body.delivered) {
                setStatus({ kind: 'sent', eventId: body.eventId });
            } else {
                setStatus({ kind: 'failed' });
            }
        } catch {
            setStatus({ kind: 'failed' });
        }
    }

    async function checkClient() {
        setStatus({ kind: 'pending' });

        try {
            const result = await checkBrowserMonitoring();

            if (!result.enabled) {
                setStatus({ kind: 'disabled' });
            } else if (result.delivered) {
                setStatus({ kind: 'sent', eventId: result.eventId });
            } else {
                setStatus({ kind: 'failed' });
            }
        } catch {
            setStatus({ kind: 'failed' });
        }
    }

    const pending = status.kind === 'pending';

    return (
        <section className="mt-5 border border-border bg-surface px-4 py-4 sm:mt-6 sm:px-5">
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                {labels.title}
            </h2>
            <p className="mt-1 text-sm text-muted">{labels.description}</p>

            <div className="mt-3 flex flex-wrap gap-2">
                <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={checkServer}
                >
                    {labels.checkServer}
                </Button>
                <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={checkClient}
                >
                    {labels.checkClient}
                </Button>
            </div>

            <p className="mt-3 min-h-5 text-sm" role="status" aria-live="polite">
                {status.kind === 'sent' ? (
                    <span className="break-all font-mono text-success">
                        {labels.sent.replace('{id}', status.eventId)}
                    </span>
                ) : null}
                {status.kind === 'disabled' ? (
                    <span className="text-muted">{labels.disabled}</span>
                ) : null}
                {status.kind === 'failed' ? (
                    <span className="text-danger">{labels.failed}</span>
                ) : null}
            </p>
        </section>
    );
}
