/**
 * In-process handoff: create → первая отрисовка страницы квиза.
 *
 * Зачем: Windows+Neon SELECT snapshotData (TOAST) сразу после INSERT
 * клинит pooled/Direct ~18s (Classic SINGLE soft-miss). Вопросы уже есть
 * в памяти на create — не читать JSONB на том hop. Refresh / другой
 * инстанс: miss → обычный pooled SELECT.
 * TTL короткий: только redirect после start. Owner-check по userId.
 * Canon: DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import type { QuizSessionPublicView } from '@/entities/quiz-session/quiz-session.types';

const HANDOFF_TTL_MS = 45_000;

type PlayLoadHandoffEntry = {
    userId: string;
    view: QuizSessionPublicView;
    expiresAt: number;
};

const globalForPlayLoad = globalThis as typeof globalThis & {
    __quizPlayLoadHandoff?: Map<string, PlayLoadHandoffEntry>;
};

function getHandoffMap() {
    if (!globalForPlayLoad.__quizPlayLoadHandoff) {
        globalForPlayLoad.__quizPlayLoadHandoff = new Map();
    }

    return globalForPlayLoad.__quizPlayLoadHandoff;
}

export function rememberQuizPlayLoad(
    sessionId: string,
    userId: string,
    view: QuizSessionPublicView,
) {
    getHandoffMap().set(sessionId, {
        userId,
        view,
        expiresAt: Date.now() + HANDOFF_TTL_MS,
    });
}

/** Забирает view один раз. Чужой userId / просрок → null. */
export function takeQuizPlayLoad(
    sessionId: string,
    userId: string,
): QuizSessionPublicView | null {
    const map = getHandoffMap();
    const entry = map.get(sessionId);

    if (!entry) {
        return null;
    }

    map.delete(sessionId);

    if (entry.userId !== userId || entry.expiresAt < Date.now()) {
        return null;
    }

    return entry.view;
}
