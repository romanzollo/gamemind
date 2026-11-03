/**
 * Темы игры в браузере: один запрос `GET /api/quiz/topics` на страницу,
 * общий для шторок Классики и Блица и «Продолжить» (внешний store +
 * useSyncExternalStore — без setState в эффекте).
 *
 * Ответ кэширует CDN, поэтому запрос дешёвый; ошибка — `failed`, и ряд
 * тем просто не показывается. Сервер всё равно проверяет тему сам.
 *
 * Canon: docs/DECISIONS.md → Play topics.
 */
'use client';

import { useSyncExternalStore } from 'react';

import {
    isPlayTopicAvailable,
    isPlayTopicId,
    type PlayTopicOption,
} from '@/entities/play-topic/play-topic';
import type { QuizSetupDifficulty } from '@/types';

export type PlayTopicsState =
    | { status: 'loading' }
    | { status: 'ready'; topics: PlayTopicOption[] }
    | { status: 'failed' };

const LOADING: PlayTopicsState = { status: 'loading' };

let current: PlayTopicsState = LOADING;
let requested = false;
const listeners = new Set<() => void>();

function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

function isPlayTopicOption(value: unknown): value is PlayTopicOption {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const topic = value as Record<string, unknown>;
    const available = topic.available as Record<string, unknown> | undefined;

    return (
        isPlayTopicId(topic.id) &&
        typeof topic.nameRu === 'string' &&
        typeof topic.nameEn === 'string' &&
        available != null &&
        isBoolean(available.EASY) &&
        isBoolean(available.MEDIUM) &&
        isBoolean(available.HARD)
    );
}

/** Разбор ответа API: чужая форма — как ошибка, а не падение шторки. */
export function parsePlayTopicsResponse(
    body: unknown,
): PlayTopicOption[] | null {
    if (!body || typeof body !== 'object') {
        return null;
    }

    const topics = (body as { topics?: unknown }).topics;

    return Array.isArray(topics) && topics.every(isPlayTopicOption)
        ? topics
        : null;
}

function publish(next: PlayTopicsState) {
    current = next;
    listeners.forEach((listener) => listener());
}

function requestOnce() {
    if (requested) {
        return;
    }

    requested = true;
    fetch('/api/quiz/topics')
        .then((response) => (response.ok ? response.json() : null))
        .then((body: unknown) => {
            const topics = parsePlayTopicsResponse(body);
            publish(topics ? { status: 'ready', topics } : { status: 'failed' });
        })
        .catch(() => publish({ status: 'failed' }));
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    requestOnce();

    return () => {
        listeners.delete(listener);
    };
}

export function usePlayTopics(): PlayTopicsState {
    return useSyncExternalStore(
        subscribe,
        () => current,
        () => LOADING,
    );
}

/**
 * Тема, которая реально уйдёт в форму: выбранная и доступная на этой
 * сложности, иначе «Все вопросы» (''). Пока темы грузятся — тоже '':
 * без списка нельзя знать, что тема доступна.
 */
export function resolveSelectedTopic(
    state: PlayTopicsState,
    topicId: string,
    difficulty: QuizSetupDifficulty,
): string {
    if (state.status !== 'ready' || topicId === '') {
        return '';
    }

    const topic = state.topics.find((item) => item.id === topicId);

    return topic && isPlayTopicAvailable(topic, difficulty) ? topic.id : '';
}
