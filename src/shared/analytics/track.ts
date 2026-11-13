/**
 * Клиентский маячок воронки (ROADMAP 3.5): `track(event)` из Client
 * Components. Только браузер; на сервере — тихо ничего не делает.
 *
 * - События копятся ~1 с и уходят одной пачкой через `navigator.sendBeacon`
 *   (не блокирует ни клик, ни переход; переживает закрытие вкладки).
 *   Без sendBeacon — `fetch` с `keepalive`. Ошибки глотаются: аналитика
 *   никогда не ломает интерфейс.
 * - При уходе со страницы (`pagehide`, вкладка скрыта) хвост отправляется сразу.
 * - visitId — случайный, в `sessionStorage`: живёт одну вкладку, между днями
 *   и вкладками посетителя не связывает. Cookie нет.
 * - Браузер с флагом в `localStorage` (владелец, админ) не шлёт ничего.
 *
 * Не вызывать на странице игры `/quiz/[id]` и на кнопках старта: этот путь
 * уже записан в БД, а горячему пути лишние запросы не нужны.
 *
 * Canon: docs/DECISIONS.md → Funnel analytics: own events + existing tables.
 */

import {
    ANALYTICS_MAX_BATCH,
    ANALYTICS_OPT_OUT_KEY,
    ANALYTICS_VISIT_ID_PATTERN,
    ANALYTICS_VISIT_KEY,
    type AnalyticsBeaconBody,
    type AnalyticsClientEvent,
} from '@/shared/analytics/events';

export const ANALYTICS_ENDPOINT = '/api/e';

/** Сколько ждать соседние события перед отправкой пачки. */
const FLUSH_DELAY_MS = 1_000;

let queue: AnalyticsClientEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

function readStorage(storage: () => Storage, key: string): string | null {
    try {
        return storage().getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(storage: () => Storage, key: string, value: string): boolean {
    try {
        storage().setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function randomVisitId(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Запасной id на случай, когда sessionStorage недоступен (приватный режим). */
let memoryVisitId: string | null = null;

/**
 * id визита этой вкладки; `created` — визит начался только что (для события
 * `visit`, которое ставит 3.5b).
 */
export function getOrCreateVisitId(): { id: string; created: boolean } {
    const stored = readStorage(() => window.sessionStorage, ANALYTICS_VISIT_KEY);
    if (stored && ANALYTICS_VISIT_ID_PATTERN.test(stored)) {
        return { id: stored, created: false };
    }
    if (memoryVisitId) {
        return { id: memoryVisitId, created: false };
    }

    const id = randomVisitId();
    if (!writeStorage(() => window.sessionStorage, ANALYTICS_VISIT_KEY, id)) {
        memoryVisitId = id;
    }
    return { id, created: true };
}

/** Браузер владельца/админа: маячок молчит навсегда (даже после выхода). */
export function isAnalyticsOptedOut(): boolean {
    return readStorage(() => window.localStorage, ANALYTICS_OPT_OUT_KEY) === '1';
}

export function optOutOfAnalytics(): void {
    writeStorage(() => window.localStorage, ANALYTICS_OPT_OUT_KEY, '1');
    queue = [];
}

function send(body: string): void {
    try {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon?.(ANALYTICS_ENDPOINT, blob)) {
            return;
        }
        void fetch(ANALYTICS_ENDPOINT, {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            credentials: 'same-origin',
        }).catch(() => undefined);
    } catch {
        // аналитика не ломает интерфейс
    }
}

/** Отправить накопленное сейчас (уход со страницы, переполнение пачки). */
export function flushAnalytics(): void {
    if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (queue.length === 0) {
        return;
    }

    const visitId = getOrCreateVisitId().id;
    while (queue.length > 0) {
        const batch = queue.splice(0, ANALYTICS_MAX_BATCH);
        const body: AnalyticsBeaconBody = {
            v: visitId,
            e: batch.map((event) => ({ n: event.name, p: event.props })),
        };
        send(JSON.stringify(body));
    }
}

function attachPageExitListeners(): void {
    if (listenersAttached) {
        return;
    }
    listenersAttached = true;
    window.addEventListener('pagehide', flushAnalytics);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushAnalytics();
        }
    });
}

/** Записать событие воронки. Безопасно вызывать откуда угодно на клиенте. */
export function track(event: AnalyticsClientEvent): void {
    if (typeof window === 'undefined' || isAnalyticsOptedOut()) {
        return;
    }

    attachPageExitListeners();
    queue.push(event);

    if (queue.length >= ANALYTICS_MAX_BATCH) {
        flushAnalytics();
        return;
    }
    flushTimer ??= setTimeout(flushAnalytics, FLUSH_DELAY_MS);
}

/** Только для тестов: сбросить состояние модуля. */
export function __resetAnalyticsForTests(): void {
    queue = [];
    if (flushTimer !== null) {
        clearTimeout(flushTimer);
    }
    flushTimer = null;
    listenersAttached = false;
    memoryVisitId = null;
}
