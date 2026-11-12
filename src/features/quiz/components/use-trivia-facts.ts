'use client';

/**
 * Факты «А ты знал?» в плашке после ответа (Классика, Челлендж дня, Вызов).
 *
 * Запрос идёт только после того, как сервер записал ответ, и никого не
 * держит: «Дальше» работает сразу, а факт дорисуется, если успеет.
 * Новый запрос или переход к следующему вопросу отменяет прежний.
 * Любой сбой (сеть, лимит, 4xx/5xx) — просто без факта.
 * Ключи показанных фактов уходят в `exclude`, чтобы факт не повторился
 * в той же партии (сервер выбирает так же, как потом разбор).
 *
 * ADR: docs/DECISIONS.md → Did you know: trivia facts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Locale } from '@/shared/i18n';

export type TriviaFactView = { key: string; text: string };

/** Столько ключей принимает маршрут факта. */
const EXCLUDE_LIMIT = 20;

function readFact(body: unknown): TriviaFactView | null {
    if (typeof body !== 'object' || body === null || !('fact' in body)) {
        return null;
    }
    const fact = (body as { fact: unknown }).fact;
    if (
        typeof fact === 'object' &&
        fact !== null &&
        typeof (fact as TriviaFactView).key === 'string' &&
        typeof (fact as TriviaFactView).text === 'string'
    ) {
        return fact as TriviaFactView;
    }
    return null;
}

export function useTriviaFacts(input: {
    sessionId: string;
    locale: Locale;
    /** false — режим с таймером: в плашке Блица фактов нет. */
    enabled: boolean;
}) {
    const { sessionId, locale, enabled } = input;
    /** Факт по токену вопроса. */
    const [facts, setFacts] = useState<Record<string, TriviaFactView>>({});
    const shownKeysRef = useRef<string[]>([]);
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => controllerRef.current?.abort(), []);

    const cancelFact = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
    }, []);

    const requestFact = useCallback(
        (questionToken: string, answerKey: string) => {
            if (!enabled) {
                return;
            }
            controllerRef.current?.abort();
            const controller = new AbortController();
            controllerRef.current = controller;

            void (async () => {
                try {
                    const response = await fetch(
                        `/api/quiz/${encodeURIComponent(sessionId)}/fact`,
                        {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({
                                question: questionToken,
                                key: answerKey,
                                exclude:
                                    shownKeysRef.current.slice(-EXCLUDE_LIMIT),
                                locale,
                            }),
                            signal: controller.signal,
                        },
                    );
                    if (!response.ok) {
                        return;
                    }
                    const fact = readFact(await response.json());
                    if (!fact || controller.signal.aborted) {
                        return;
                    }
                    shownKeysRef.current = [...shownKeysRef.current, fact.key];
                    setFacts((previous) => ({
                        ...previous,
                        [questionToken]: fact,
                    }));
                } catch {
                    // Отмена или сеть: факт — бонус, плашка остаётся как есть.
                }
            })();
        },
        [enabled, locale, sessionId],
    );

    return { facts, requestFact, cancelFact };
}
