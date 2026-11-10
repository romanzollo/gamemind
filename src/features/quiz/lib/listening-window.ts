/**
 * «Окно прослушивания» AUDIO_GUESS в Блице и Выживании — одна формула для
 * сервера (пересчёт при сдаче) и клиента (таймер на экране).
 *
 * Правило: пока игрок на музыкальном вопросе, часы стоят, но не дольше
 * `AUDIO_LISTEN_WINDOW_SECONDS` (клип 10 с + 2 с на реакцию). Длину паузы
 * считаем только по времени ответов, не по словам клиента «я слушал»:
 *
 *   пауза(j) = min(окно, время ответа j − время предыдущего ответа)
 *
 * «Предыдущий ответ» — ответ раньше по времени; для первого — старт часов.
 * Сервер берёт `answeredAt` (время прихода фиксации, JS Date), клиент —
 * момент своего тапа по часам сервера (`serverNow`); разница ≤ задержки
 * сети и покрыта grace 3 с. Неиспользованный остаток окна не копится.
 *
 * Пропущенный (не загрузившийся) клип ответа не имеет → паузы нет.
 * Чистые функции, без БД и React. ADR: docs/DECISIONS.md → Audio questions:
 * AUDIO_GUESS (Blitz and Survival: the listening window).
 */

import type { QuestionType } from '@/features/quiz/types';

/** Сколько секунд часы стоят на музыкальном вопросе (решение владельца, 10 ноя). */
export const AUDIO_LISTEN_WINDOW_SECONDS = 12;

const WINDOW_MS = AUDIO_LISTEN_WINDOW_SECONDS * 1000;

export type ListeningLock = {
    questionId: string;
    /** Время ответа: сервер — `answeredAt`, клиент — тап по `serverNow`. */
    answeredAtMs: number;
    isAudio: boolean;
};

export function isAudioQuestionType(type: QuestionType | undefined): boolean {
    return type === 'AUDIO_GUESS';
}

/** Сколько аудиовопросов в партии (для потолка Блица). */
export function countAudioQuestions(
    questions: ReadonlyArray<{ type?: QuestionType }>,
): number {
    return questions.filter((question) => isAudioQuestionType(question.type)).length;
}

/** Пауза одного ответа: время на вопросе, но не больше окна. */
export function listeningCreditMs(
    shownAtMs: number,
    answeredAtMs: number,
    windowMs: number = WINDOW_MS,
): number {
    if (!Number.isFinite(shownAtMs) || !Number.isFinite(answeredAtMs)) {
        return 0;
    }
    return Math.min(windowMs, Math.max(0, answeredAtMs - shownAtMs));
}

/** Ответы по времени (при равенстве — по id, как ORDER BY в БД). */
export function sortLocksByTime<T extends ListeningLock>(locks: readonly T[]): T[] {
    return [...locks].sort(
        (left, right) =>
            left.answeredAtMs - right.answeredAtMs ||
            left.questionId.localeCompare(right.questionId),
    );
}

/**
 * Паузы всех ответов: `creditByQuestion` и сумма. Ответы — в любом
 * порядке, внутри сортируются по времени.
 */
export function computeListeningCredits(input: {
    startMs: number;
    locks: readonly ListeningLock[];
    windowMs?: number;
}): { totalMs: number; creditByQuestion: Map<string, number> } {
    const creditByQuestion = new Map<string, number>();
    let previousAtMs = input.startMs;
    let totalMs = 0;
    for (const lock of sortLocksByTime(input.locks)) {
        const credit = lock.isAudio
            ? listeningCreditMs(previousAtMs, lock.answeredAtMs, input.windowMs)
            : 0;
        creditByQuestion.set(lock.questionId, credit);
        totalMs += credit;
        previousAtMs = lock.answeredAtMs;
    }
    return { totalMs, creditByQuestion };
}

/**
 * Пауза, которая идёт прямо сейчас (клиент): игрок на аудиовопросе без
 * ответа. Окно открылось в момент последнего ответа (или старта часов).
 */
export function currentListeningWindow(input: {
    startMs: number;
    locks: readonly ListeningLock[];
    currentIsAudio: boolean;
    nowMs: number;
    windowMs?: number;
}): { creditMs: number; active: boolean; remainingMs: number } {
    const windowMs = input.windowMs ?? WINDOW_MS;
    if (!input.currentIsAudio) {
        return { creditMs: 0, active: false, remainingMs: 0 };
    }
    const lastAtMs = input.locks.reduce(
        (latest, lock) => Math.max(latest, lock.answeredAtMs),
        input.startMs,
    );
    const creditMs = listeningCreditMs(lastAtMs, input.nowMs, windowMs);
    return {
        creditMs,
        active: creditMs < windowMs,
        remainingMs: Math.max(0, windowMs - creditMs),
    };
}

/** Потолок Блица: 60 с + окно на каждый аудиовопрос. */
export function blitzSessionDurationSeconds(
    baseDurationSeconds: number,
    audioQuestionCount: number,
): number {
    return baseDurationSeconds + AUDIO_LISTEN_WINDOW_SECONDS * Math.max(0, audioQuestionCount);
}

export type BlitzReplayResult<T extends ListeningLock> = {
    /** Засчитанные ответы в порядке времени. */
    counted: T[];
    /** Ответы после своего дедлайна (с паузами и grace) — не в зачёте. */
    late: T[];
    /** Сумма пауз засчитанных ответов (`QuizResult.clockCreditMs`). */
    clockCreditMs: number;
};

/**
 * Пересчёт Блица при сдаче. `timedEndsAt` в БД — потолок
 * (старт + 60 с + окно × аудио); базовый дедлайн = потолок − окно × аудио.
 * Ответ засчитан, если `answeredAt − grace < базовый дедлайн + паузы до него
 * включительно` — та же граница, что у фиксации ответа (`timedEndsAt >
 * now − grace`). После первого опоздавшего ответа не засчитан ни один:
 * часы не идут назад. Без аудио результат совпадает с прежним правилом.
 */
export function replayBlitzLocks<T extends ListeningLock>(input: {
    timedEndsAtMs: number;
    durationSeconds: number;
    audioQuestionCount: number;
    locks: readonly T[];
    graceSeconds: number;
    windowMs?: number;
}): BlitzReplayResult<T> {
    const windowMs = input.windowMs ?? WINDOW_MS;
    const baseDeadlineMs =
        input.timedEndsAtMs - windowMs * Math.max(0, input.audioQuestionCount);
    const startMs = baseDeadlineMs - input.durationSeconds * 1000;
    const graceMs = Math.max(0, input.graceSeconds) * 1000;

    const counted: T[] = [];
    const late: T[] = [];
    let creditMs = 0;
    let previousAtMs = startMs;
    let closed = false;

    for (const lock of sortLocksByTime(input.locks)) {
        const credit = lock.isAudio
            ? listeningCreditMs(previousAtMs, lock.answeredAtMs, windowMs)
            : 0;
        previousAtMs = lock.answeredAtMs;
        const deadlineMs = baseDeadlineMs + creditMs + credit;
        if (closed || !(deadlineMs > lock.answeredAtMs - graceMs)) {
            closed = true;
            late.push(lock);
            continue;
        }
        creditMs += credit;
        counted.push(lock);
    }

    return { counted, late, clockCreditMs: creditMs };
}

/**
 * Порядок вопросов партии при создании: аудиовопрос не первый и не сразу
 * после другого. Так к его показу уже был тап (iOS разрешает звук) и клип
 * успел скачаться. Меняем порядок минимально: «плохой» аудиовопрос
 * пропускает вперёд ближайший обычный. Не хватает обычных — оставляем как есть.
 */
export function arrangeAudioQuestions<T extends { type?: QuestionType }>(
    items: readonly T[],
): T[] {
    const out = [...items];
    const isAudio = (item: T | undefined) => isAudioQuestionType(item?.type);
    for (let index = 0; index < out.length; index += 1) {
        const misplaced = isAudio(out[index]) && (index === 0 || isAudio(out[index - 1]));
        if (!misplaced) continue;
        const swapFrom = out.findIndex((item, k) => k > index && !isAudio(item));
        if (swapFrom === -1) break;
        const [moved] = out.splice(swapFrom, 1);
        out.splice(index, 0, moved);
    }
    return out;
}

/**
 * Следующий вопрос в быстрых режимах, если клип мог не скачаться.
 * `notReady(i)` — аудиовопрос, чей клип ещё не в памяти. Такой вопрос один
 * раз уходит в конец очереди; во второй раз — пропуск (без ответа: 0 очков,
 * без потери времени и без −6). Возвращает новую очередь, позицию (null —
 * вопросов не осталось) и пропущенные индексы.
 */
export function advanceAudioQueue(input: {
    order: readonly number[];
    position: number;
    isDone: (questionIndex: number) => boolean;
    notReady: (questionIndex: number) => boolean;
    deferred: ReadonlySet<number>;
}): {
    order: number[];
    position: number | null;
    deferred: Set<number>;
    skipped: number[];
} {
    const order = [...input.order];
    const deferred = new Set(input.deferred);
    const skipped: number[] = [];
    let position = input.position + 1;

    while (position < order.length) {
        const questionIndex = order[position];
        if (input.isDone(questionIndex) || skipped.includes(questionIndex)) {
            position += 1;
            continue;
        }
        if (input.notReady(questionIndex)) {
            if (!deferred.has(questionIndex) && position < order.length - 1) {
                deferred.add(questionIndex);
                order.splice(position, 1);
                order.push(questionIndex);
                continue;
            }
            skipped.push(questionIndex);
            position += 1;
            continue;
        }
        return { order, position, deferred, skipped };
    }
    return { order, position: null, deferred, skipped };
}

export type ListeningClockReading = {
    /** Сколько добавить к дедлайну / банку сейчас (засчитанные + текущее окно). */
    creditMs: number;
    /** Окно идёт прямо сейчас — часы стоят. */
    active: boolean;
    /** Остаток текущего окна. */
    remainingMs: number;
};

/**
 * Часы клиента: паузы уже отвеченных аудиовопросов + окно, которое идёт
 * сейчас, если следующий вопрос — музыкальный с готовым клипом.
 * Возвращает функцию от «сейчас» — таймер зовёт её на каждом тике.
 */
export function buildListeningClock(input: {
    startMs: number;
    locks: readonly ListeningLock[];
    upcomingIsAudio: boolean;
}): (nowMs: number) => ListeningClockReading {
    const doneMs = computeListeningCredits({
        startMs: input.startMs,
        locks: input.locks,
    }).totalMs;
    return (nowMs) => {
        const current = currentListeningWindow({
            startMs: input.startMs,
            locks: input.locks,
            currentIsAudio: input.upcomingIsAudio,
            nowMs,
        });
        return {
            creditMs: doneMs + current.creditMs,
            active: input.upcomingIsAudio && current.active,
            remainingMs: current.remainingMs,
        };
    };
}
