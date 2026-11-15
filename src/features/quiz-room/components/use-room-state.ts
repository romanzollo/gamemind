'use client';

/**
 * Живое состояние комнаты на телефоне: опрос `GET /api/room/{code}` по
 * расписанию (`nextRoomPollDelay`), один запрос в полёте, повтор после
 * сбоя сети с паузой 1–4 с и плашкой «Связь пропала» со второго сбоя.
 * `refresh()` — спросить сразу (после своего действия: настройки, старт,
 * ответ). Часы — серверные (`serverNow`, общий синхронизатор `/api/time`).
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { nextRoomPollDelay } from '@/features/quiz-room/lib/room-poll';
import type { RoomStateDto } from '@/features/quiz-room/types';
import type { Locale } from '@/shared/i18n';
import { serverNow, useServerClockReady } from '@/shared/ui/server-clock';

const RETRY_STEP_MS = 1_000;
const RETRY_MAX_MS = 4_000;
const NOW_TICK_MS = 200;

export function useRoomState(initial: RoomStateDto, locale: Locale) {
    const [state, setState] = useState(initial);
    const [connectionLost, setConnectionLost] = useState(false);
    const stateRef = useRef(initial);
    const refreshRef = useRef<() => void>(() => undefined);
    const code = initial.code;

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let inFlight = false;
        let again = false;
        let failures = 0;

        const schedule = () => {
            if (cancelled) return;
            if (timer) clearTimeout(timer);

            const delay = failures
                ? Math.min(RETRY_MAX_MS, RETRY_STEP_MS * failures)
                : nextRoomPollDelay(stateRef.current, serverNow());

            if (delay !== null) {
                timer = setTimeout(poll, delay);
            }
        };

        const poll = async () => {
            if (inFlight) {
                again = true;
                return;
            }

            inFlight = true;

            try {
                const response = await fetch(
                    `/api/room/${code}?locale=${locale}`,
                    { cache: 'no-store' },
                );

                if (!response.ok) {
                    throw new Error(`room poll ${response.status}`);
                }

                const next = (await response.json()) as RoomStateDto;

                if (!cancelled) {
                    stateRef.current = next;
                    setState(next);
                    failures = 0;
                    setConnectionLost(false);
                }
            } catch {
                failures += 1;

                if (!cancelled && failures >= 2) {
                    setConnectionLost(true);
                }
            } finally {
                inFlight = false;
            }

            if (again) {
                again = false;
                void poll();
                return;
            }

            schedule();
        };

        refreshRef.current = () => {
            if (timer) clearTimeout(timer);
            void poll();
        };

        schedule();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [code, locale]);

    const refresh = useCallback(() => refreshRef.current(), []);

    return { state, connectionLost, refresh };
}

/** «Сейчас» по серверным часам, обновляется 5 раз в секунду (таймеры). */
export function useRoomNow(): number {
    useServerClockReady();
    const [now, setNow] = useState(() => serverNow());

    useEffect(() => {
        const interval = setInterval(() => setNow(serverNow()), NOW_TICK_MS);

        return () => clearInterval(interval);
    }, []);

    return now;
}

/** POST в API комнаты: `{ ok }` или код ошибки сервера. */
export async function postRoom(
    url: string,
    body: unknown,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

        return response.ok
            ? { ok: true, data }
            : { ok: false, error: typeof data.error === 'string' ? data.error : 'RETRY' };
    } catch {
        return { ok: false, error: 'RETRY' };
    }
}
