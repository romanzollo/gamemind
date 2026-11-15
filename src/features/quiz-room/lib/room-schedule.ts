/**
 * Расписание комнаты: когда какой вопрос показывается, когда открываются
 * варианты и когда закрывается приём ответов. Задаётся один раз на старте
 * (`buildRoomSchedule`) и хранится по вопросам в `RoomQuestion`; сервер и
 * каждый телефон читают одни и те же времена — ведущему не нужно жать
 * «Дальше», и закрытая вкладка ведущего игру не останавливает.
 *
 * Фазы вопроса: intro (текст и картинка, без вариантов) → answer (варианты,
 * идёт таймер) → reveal (верный ответ и таблица). Перед первым вопросом —
 * отсчёт. Досрочное закрытие (все ответили) переносит closeAt и сдвигает
 * следующие вопросы — `shiftScheduleAfterEarlyClose`.
 *
 * Все времена — миллисекунды эпохи (серверные часы). Canon: DECISIONS → Quiz room.
 */

import { ROOM_TIMING } from '@/features/quiz-room/lib/room-rules';

export type RoomQuestionTimes = {
    position: number;
    introAt: number;
    openAt: number;
    closeAt: number;
};

/** Время на чтение вопроса до вариантов: 3–6 с по длине текста. */
export function introMsForText(chars: number): number {
    const reading = Math.round(
        (Math.max(0, chars) / ROOM_TIMING.introCharsPerSecond) * 1000,
    );

    return Math.min(
        ROOM_TIMING.introMaxMs,
        Math.max(ROOM_TIMING.introMinMs, ROOM_TIMING.introMinMs / 2 + reading),
    );
}

/**
 * Расписание всей игры от момента старта. `textLengths` — длина текста
 * вопроса (бóльшая из RU и EN), по позициям.
 */
export function buildRoomSchedule(
    startedAtMs: number,
    textLengths: readonly number[],
    answerSeconds: number,
): RoomQuestionTimes[] {
    const answerMs = answerSeconds * 1000;
    const schedule: RoomQuestionTimes[] = [];
    let cursor = startedAtMs + ROOM_TIMING.countdownMs;

    textLengths.forEach((chars, position) => {
        const introAt = cursor;
        const openAt = introAt + introMsForText(chars);
        const closeAt = openAt + answerMs;

        schedule.push({ position, introAt, openAt, closeAt });
        cursor = closeAt + ROOM_TIMING.revealMs;
    });

    return schedule;
}

/** Конец игры: разбор последнего вопроса досмотрен. */
export function getRoomEndsAt(schedule: readonly RoomQuestionTimes[]): number | null {
    const last = schedule[schedule.length - 1];

    return last ? last.closeAt + ROOM_TIMING.revealMs : null;
}

export type RoomPhase =
    | { kind: 'countdown'; endsAt: number }
    | { kind: 'intro'; position: number; endsAt: number }
    | { kind: 'answer'; position: number; endsAt: number }
    | { kind: 'reveal'; position: number; endsAt: number }
    | { kind: 'finished' };

/**
 * Фаза в момент `now`. Разбор вопроса длится до показа следующего (после
 * досрочного закрытия расписание уже сдвинуто — берём фактический introAt).
 */
export function getRoomPhase(
    schedule: readonly RoomQuestionTimes[],
    now: number,
): RoomPhase {
    const first = schedule[0];

    if (!first) {
        return { kind: 'finished' };
    }

    if (now < first.introAt) {
        return { kind: 'countdown', endsAt: first.introAt };
    }

    for (let index = 0; index < schedule.length; index += 1) {
        const times = schedule[index]!;
        const next = schedule[index + 1];
        const revealEndsAt = next
            ? next.introAt
            : times.closeAt + ROOM_TIMING.revealMs;

        if (now < times.openAt) {
            return { kind: 'intro', position: times.position, endsAt: times.openAt };
        }

        if (now < times.closeAt) {
            return { kind: 'answer', position: times.position, endsAt: times.closeAt };
        }

        if (now < revealEndsAt) {
            return { kind: 'reveal', position: times.position, endsAt: revealEndsAt };
        }
    }

    return { kind: 'finished' };
}

/** Сколько вопросов уже раскрыто (их очки видны в таблице). */
export function countRevealedQuestions(
    schedule: readonly RoomQuestionTimes[],
    now: number,
): number {
    return schedule.filter((times) => times.closeAt <= now).length;
}

/**
 * Принимается ли ответ, пришедший в `receivedAt`: варианты уже открыты и
 * приём не закрыт (с запасом на сеть).
 */
export function isAnswerWindowOpen(
    times: Pick<RoomQuestionTimes, 'openAt' | 'closeAt'>,
    receivedAt: number,
): boolean {
    return (
        receivedAt >= times.openAt &&
        receivedAt <= times.closeAt + ROOM_TIMING.answerGraceMs
    );
}

/**
 * Досрочное закрытие вопроса `position` в `closeAt`: следующие вопросы
 * сдвигаются на сэкономленное время. Та же арифметика — в UPDATE
 * репозитория; эта функция — для тестов и клиента.
 */
export function shiftScheduleAfterEarlyClose(
    schedule: readonly RoomQuestionTimes[],
    position: number,
    closeAt: number,
): RoomQuestionTimes[] {
    const target = schedule.find((times) => times.position === position);

    if (!target || closeAt >= target.closeAt) {
        return [...schedule];
    }

    const shift = target.closeAt - closeAt;

    return schedule.map((times) => {
        if (times.position < position) {
            return times;
        }

        if (times.position === position) {
            return { ...times, closeAt };
        }

        return {
            position: times.position,
            introAt: times.introAt - shift,
            openAt: times.openAt - shift,
            closeAt: times.closeAt - shift,
        };
    });
}
