/**
 * In-process handoff: create → первая отрисовка страницы квиза.
 *
 * Зачем: Windows+Neon SELECT snapshotData (TOAST) сразу после INSERT
 * клинит pooled/Direct ~18s (Classic SINGLE soft-miss). Вопросы уже есть
 * в памяти на create — не читать JSONB на том hop. Refresh / другой
 * инстанс: miss → обычный pooled SELECT (Classic/Blitz/Daily).
 * Survival: peek без delete + длиннее TTL — refresh и **submit scoring**
 * в том же next dev без TOAST loop. Prod play-load miss → pooled SELECT 18s.
 * Survival submit: handoff snapshot (уже в памяти) — не SELECT TOAST.
 * Canon: DECISIONS.md → Quiz Start / Session Load Playbook; QUIZ_NEON_HOT_PATH.md.
 */

import type { QuizSessionSnapshotData } from '@/entities/quiz-session/quiz-session-snapshot';
import type { QuizSessionPublicView } from '@/entities/quiz-session/quiz-session.types';

const HANDOFF_TTL_MS = 45_000;

/**
 * Survival: F5 + волна + submit в том же next-dev процессе.
 * 120s мало: start recover ~45s не в TTL, но сама волна + submit могут
 * уехать за 2 мин. Не source of truth — другой isolate = Postgres.
 */
const SURVIVAL_HANDOFF_TTL_MS = 10 * 60 * 1000;

type PlayLoadHandoffEntry = {
    userId: string;
    view: QuizSessionPublicView;
    expiresAt: number;
    /** true → peek (не delete); длиннее TTL. */
    isSurvival: boolean;
    /**
     * Frozen snapshot для Survival submit scoring / slim reviewPayload.
     * Без повторного SELECT TOAST после JSONB write (Aug 14).
     */
    snapshotData?: QuizSessionSnapshotData;
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
    snapshotData?: QuizSessionSnapshotData,
) {
    const isSurvival = view.survival != null;
    const ttlMs = isSurvival ? SURVIVAL_HANDOFF_TTL_MS : HANDOFF_TTL_MS;

    getHandoffMap().set(sessionId, {
        userId,
        view,
        expiresAt: Date.now() + ttlMs,
        isSurvival,
        snapshotData: isSurvival ? snapshotData : undefined,
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

/**
 * Survival submit: scoring + reviewPayload из памяти create.
 * Не SELECT snapshotData TOAST (тот же hang, что play-load после JSONB write).
 */
export function peekSurvivalSubmitSnapshot(
    sessionId: string,
    userId: string,
): {
    view: QuizSessionPublicView;
    snapshotData: QuizSessionSnapshotData;
} | null {
    const entry = resolveHandoffEntry(sessionId, userId);

    if (!entry?.isSurvival || !entry.snapshotData || !entry.view.survival) {
        return null;
    }

    return {
        view: entry.view,
        snapshotData: entry.snapshotData,
    };
}
