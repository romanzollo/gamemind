/**
 * In-process handoff: create → первая отрисовка страницы квиза.
 *
 * Зачем: Windows+Neon SELECT snapshotData (TOAST) сразу после INSERT
 * клинит pooled/Direct ~18s (Classic SINGLE soft-miss). Вопросы уже есть
 * в памяти на create — не читать JSONB на том hop. Refresh / другой
 * инстанс: miss → обычный pooled SELECT (Classic/Blitz/Daily).
 * Survival: peek без delete + длиннее TTL — refresh в том же next dev
 * без 5s×2 TOAST loop. Prod miss → pooled SELECT 18s (submit path отдельно).
 * TTL короткий для Classic: только redirect после start. Owner-check по userId.
 * Survival handoff может нести isCorrect (принятый leak); Classic/Blitz/Daily — нет.
 * Canon: DECISIONS.md → Quiz Start / Session Load Playbook.
 */

import type { QuizSessionPublicView } from '@/entities/quiz-session/quiz-session.types';

const HANDOFF_TTL_MS = 45_000;

/** Survival: refresh/F5 в том же dev-процессе — handoff не съедается take. */
const SURVIVAL_HANDOFF_TTL_MS = 120_000;

type PlayLoadHandoffEntry = {
    userId: string;
    view: QuizSessionPublicView;
    expiresAt: number;
    /** true → peek (не delete); длиннее TTL. */
    isSurvival: boolean;
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

function resolveHandoffEntry(
    sessionId: string,
    userId: string,
): PlayLoadHandoffEntry | null {
    const map = getHandoffMap();
    const entry = map.get(sessionId);

    if (!entry) {
        return null;
    }

    if (entry.userId !== userId || entry.expiresAt < Date.now()) {
        map.delete(sessionId);
        return null;
    }

    return entry;
}

export function rememberQuizPlayLoad(
    sessionId: string,
    userId: string,
    view: QuizSessionPublicView,
) {
    const isSurvival = view.survival != null;
    const ttlMs = isSurvival ? SURVIVAL_HANDOFF_TTL_MS : HANDOFF_TTL_MS;

    getHandoffMap().set(sessionId, {
        userId,
        view,
        expiresAt: Date.now() + ttlMs,
        isSurvival,
    });
}

/**
 * Забирает view один раз (Classic/Blitz/Daily). Survival — см. resolveQuizPlayLoadHandoff.
 * Чужой userId / просрок → null.
 */
export function takeQuizPlayLoad(
    sessionId: string,
    userId: string,
): QuizSessionPublicView | null {
    const entry = resolveHandoffEntry(sessionId, userId);

    if (!entry) {
        return null;
    }

    getHandoffMap().delete(sessionId);
    return entry.view;
}

/**
 * Play-load: Survival peek (не delete), Classic/Blitz/Daily take (delete).
 * Один вызов на странице — не дублировать take+peek.
 */
export function resolveQuizPlayLoadHandoff(
    sessionId: string,
    userId: string,
): QuizSessionPublicView | null {
    const entry = resolveHandoffEntry(sessionId, userId);

    if (!entry) {
        return null;
    }

    if (entry.isSurvival) {
        return entry.view;
    }

    getHandoffMap().delete(sessionId);
    return entry.view;
}
