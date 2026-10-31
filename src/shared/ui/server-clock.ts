/**
 * Часы сервера на клиенте: `serverNow()` = Date.now() + поправка.
 *
 * Зачем: таймеры Выживания и Блица сравнивают «сейчас» с серверными
 * `startedAt` / `timedEndsAt`. По часам устройства, спешащим на 2 с, банк
 * обрывался раньше, чем считал сервер, а отсчёт 3‑2‑1 укорачивался до «1»
 * (прод, окт 2026). Авторитет по-прежнему сервер — поправка только
 * выравнивает то, что видит игрок, с тем, что потом проверит submit.
 *
 * Как в NTP: запрос к `/api/time`, поправка = время сервера − середина
 * интервала запроса; из нескольких замеров берём самый быстрый — ошибка не
 * больше половины его задержки (десятки мс). Пока замер не прошёл или не
 * удался — поправка 0 (обычные часы устройства); на замер — таймаут, чтобы
 * сбой сети не держал игрока на заставке.
 * Только из Client Components.
 */

import { useEffect, useSyncExternalStore } from 'react';

const SAMPLE_COUNT = 3;
const SAMPLE_TIMEOUT_MS = 1500;

let offsetMs = 0;
let ready = false;
let syncPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function serverNow(): number {
    return Date.now() + offsetMs;
}

async function measureOffset(): Promise<void> {
    let best: { roundTripMs: number; offsetMs: number } | null = null;

    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
        const sentAt = Date.now();
        const response = await fetch('/api/time', {
            cache: 'no-store',
            signal: AbortSignal.timeout(SAMPLE_TIMEOUT_MS),
        });
        const receivedAt = Date.now();

        if (!response.ok) {
            continue;
        }

        const body: unknown = await response.json();
        const serverMs =
            typeof body === 'object' && body !== null && 'now' in body
                ? Number(body.now)
                : Number.NaN;

        if (!Number.isFinite(serverMs)) {
            continue;
        }

        const roundTripMs = receivedAt - sentAt;
        // Первый запрос несёт установку соединения — его задержка больше,
        // поэтому и выбираем замер с минимальным round trip.
        if (!best || roundTripMs < best.roundTripMs) {
            best = {
                roundTripMs,
                offsetMs: serverMs - (sentAt + receivedAt) / 2,
            };
        }
    }

    if (best) {
        offsetMs = Math.round(best.offsetMs);
    }
}

function markReady() {
    ready = true;
    for (const listener of listeners) {
        listener();
    }
}

/** Один замер на загрузку страницы. Сбой — остаёмся на часах устройства. */
export function syncServerClock(): Promise<void> {
    syncPromise ??= measureOffset()
        .catch(() => undefined)
        .finally(markReady);

    return syncPromise;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Запускает замер при монтировании; `true`, когда поправка известна (или
 * замер не удался). Таймеры, которым важен старт (заставка 3‑2‑1), ждут.
 */
export function useServerClockReady(): boolean {
    useEffect(() => {
        void syncServerClock();
    }, []);

    return useSyncExternalStore(
        subscribe,
        () => ready,
        () => false,
    );
}
