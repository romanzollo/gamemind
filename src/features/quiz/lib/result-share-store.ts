'use client';

/**
 * Данные для «Поделиться», которые страница результата и так грузит
 * в других блоках: ответы разбора (квадратики) и серия Челленджа.
 *
 * Зачем store: кнопка стоит рядом со счётом, а разбор и серия приходят
 * позже в своих Suspense/клиентских загрузках. Публикуем их сюда, кнопка
 * подписывается — без второго запроса к БД. Не пришло — текст без
 * квадратиков / без серии.
 */

import { useSyncExternalStore } from 'react';

type ReviewLite = { position: number; isCorrect: boolean };

const reviewBySession = new Map<string, ReviewLite[]>();
let dailyStreakDays: number | null = null;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) {
        listener();
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function publishResultReview(
    sessionId: string,
    items: ReadonlyArray<ReviewLite>,
): void {
    reviewBySession.set(
        sessionId,
        items.map((item) => ({ position: item.position, isCorrect: item.isCorrect })),
    );
    emit();
}

export function publishDailyStreakDays(days: number): void {
    if (dailyStreakDays === days) {
        return;
    }
    dailyStreakDays = days;
    emit();
}

export function useResultReviewForShare(sessionId: string): ReviewLite[] | null {
    return useSyncExternalStore(
        subscribe,
        () => reviewBySession.get(sessionId) ?? null,
        () => null,
    );
}

export function useDailyStreakDaysForShare(): number | null {
    return useSyncExternalStore(
        subscribe,
        () => dailyStreakDays,
        () => null,
    );
}
