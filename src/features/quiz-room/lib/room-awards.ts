/**
 * Награды раунда и цель «до места» (чистые функции, без БД).
 *
 * Десять наград дают титул не только победителю — повод остаться на ещё
 * раунд и стать лучше. Правила раздачи:
 * - у игрока не больше одной награды (иначе сильнейший забирает всё);
 * - награды раздаются по порядку `ROOM_AWARD_ORDER`, каждая — лучшему из
 *   ещё не награждённых, кто её заслужил (порог у каждой свой); никто не
 *   заслужил — награды нет;
 * - «Храбрец» — последнему по месту, кто остался без награды (по-доброму:
 *   «держался до последнего вопроса»).
 * Цель «до места» — сколько очков до ближайшего игрока выше.
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import {
    computeRoomStandings,
    type RoomScoredAnswer,
    type RoomStanding,
} from '@/features/quiz-room/lib/room-scoring';

export const ROOM_AWARD_ORDER = [
    'fastest',
    'sniper',
    'streak',
    'solo',
    'lightning',
    'clutch',
    'finisher',
    'climb',
    'trigger',
] as const;

export type RoomAwardKind = (typeof ROOM_AWARD_ORDER)[number] | 'brave';

/** Все виды — для коллекции в профиле. */
export const ROOM_AWARD_KINDS: readonly RoomAwardKind[] = [...ROOM_AWARD_ORDER, 'brave'];

/**
 * `value` по виду: fastest — среднее мс верного ответа; sniper — верных;
 * streak — верных подряд; solo — вопросов, где знал один; lightning — мс
 * самого быстрого верного; clutch — верных в последней четверти таймера;
 * finisher — очков в последних 3 вопросах; climb — мест вверх; trigger —
 * сколько раз ответил первым; brave — 0.
 */
export type RoomAward = { kind: RoomAwardKind; playerId: string; value: number };

/** Минимум для серии: две подряд — ещё не подвиг. */
const STREAK_MIN = 3;
/** «Кнопкодав» — хотя бы дважды первым. */
const TRIGGER_MIN = 2;
/** «Сильный финиш» — по последним вопросам, если игра не короче. */
const FINISH_LAST = 3;
const FINISH_MIN_QUESTIONS = 5;
/** «Последние секунды» — последняя четверть окна ответа. */
const CLUTCH_SHARE = 0.75;

type Metric = { playerId: string; value: number };

export function computeRoomAwards(
    playerIds: readonly string[],
    answers: readonly RoomScoredAnswer[],
    questionCount: number,
    answerMs: number,
): RoomAward[] {
    if (playerIds.length < 2 || questionCount === 0) {
        return [];
    }

    const played = answers.filter((answer) => answer.position < questionCount);
    const final = computeRoomStandings(playerIds, played, questionCount);
    const rankOf = new Map(final.map((row) => [row.playerId, row.rank]));
    const order = new Map(final.map((row, index) => [row.playerId, index]));
    const own = (playerId: string) => played.filter((answer) => answer.playerId === playerId);
    const correctOf = (playerId: string) => own(playerId).filter((answer) => answer.isCorrect);

    const byPosition = new Map<number, RoomScoredAnswer[]>();
    for (const answer of played) {
        byPosition.set(answer.position, [...(byPosition.get(answer.position) ?? []), answer]);
    }

    const count = (values: Metric[], predicate: (playerId: string) => number) =>
        playerIds.forEach((playerId) => values.push({ playerId, value: predicate(playerId) }));

    // Метрики по видам: { кто, значение }, и в какую сторону «лучше».
    const metrics: Record<(typeof ROOM_AWARD_ORDER)[number], { values: Metric[]; better: 'high' | 'low'; min: number }> = {
        fastest: { values: [], better: 'low', min: 0 },
        sniper: { values: [], better: 'high', min: 1 },
        streak: { values: [], better: 'high', min: STREAK_MIN },
        solo: { values: [], better: 'high', min: 1 },
        lightning: { values: [], better: 'low', min: 0 },
        clutch: { values: [], better: 'high', min: 1 },
        finisher: { values: [], better: 'high', min: 1 },
        climb: { values: [], better: 'high', min: 1 },
        trigger: { values: [], better: 'high', min: TRIGGER_MIN },
    };

    for (const playerId of playerIds) {
        const correct = correctOf(playerId);

        if (correct.length > 0) {
            metrics.fastest.values.push({
                playerId,
                value: correct.reduce((sum, answer) => sum + Math.max(0, answer.elapsedMs), 0) / correct.length,
            });
            metrics.lightning.values.push({
                playerId,
                value: Math.min(...correct.map((answer) => Math.max(0, answer.elapsedMs))),
            });
        }
    }

    count(metrics.sniper.values, (playerId) => correctOf(playerId).length);

    count(metrics.streak.values, (playerId) => {
        const correctPositions = new Set(correctOf(playerId).map((answer) => answer.position));
        let best = 0;
        let run = 0;

        for (let position = 0; position < questionCount; position += 1) {
            run = correctPositions.has(position) ? run + 1 : 0;
            best = Math.max(best, run);
        }

        return best;
    });

    count(metrics.solo.values, (playerId) =>
        [...byPosition.values()].filter((group) => {
            const right = group.filter((answer) => answer.isCorrect);
            return right.length === 1 && right[0]!.playerId === playerId;
        }).length,
    );

    count(metrics.clutch.values, (playerId) =>
        correctOf(playerId).filter((answer) => answer.elapsedMs >= answerMs * CLUTCH_SHARE).length,
    );

    if (questionCount >= FINISH_MIN_QUESTIONS) {
        count(metrics.finisher.values, (playerId) =>
            own(playerId)
                .filter((answer) => answer.position >= questionCount - FINISH_LAST)
                .reduce((sum, answer) => sum + answer.points, 0),
        );
    }

    if (questionCount >= 2) {
        const afterFirst = new Map(
            computeRoomStandings(playerIds, played, 1).map((row) => [row.playerId, row.rank]),
        );
        count(metrics.climb.values, (playerId) =>
            (afterFirst.get(playerId) ?? 0) - (rankOf.get(playerId) ?? 0),
        );
    }

    count(metrics.trigger.values, (playerId) =>
        [...byPosition.values()].filter((group) => {
            if (group.length < 2) return false;
            const first = [...group].sort((left, right) => left.elapsedMs - right.elapsedMs)[0]!;
            return first.playerId === playerId;
        }).length,
    );

    const awards: RoomAward[] = [];
    const awarded = new Set<string>();

    for (const kind of ROOM_AWARD_ORDER) {
        if (awarded.size >= playerIds.length) break;

        const { values, better, min } = metrics[kind];
        const winner = values
            .filter((metric) => !awarded.has(metric.playerId))
            .filter((metric) => (better === 'high' ? metric.value >= min : true))
            .sort(
                (left, right) =>
                    (better === 'high' ? right.value - left.value : left.value - right.value) ||
                    order.get(left.playerId)! - order.get(right.playerId)!,
            )[0];

        if (winner) {
            awards.push({ kind, playerId: winner.playerId, value: winner.value });
            awarded.add(winner.playerId);
        }
    }

    const brave = [...final].reverse().find((row) => !awarded.has(row.playerId));

    if (brave) {
        awards.push({ kind: 'brave', playerId: brave.playerId, value: 0 });
    }

    return awards;
}

export type RoomGoal =
    | { kind: 'lead'; ahead: number }
    | { kind: 'chase'; targetRank: number; behind: number }
    | null;

/**
 * Цель на следующий вопрос: лидеру — отрыв от второго, остальным — сколько
 * очков до ближайшего игрока выше. null — один в комнате или нет очков ни у
 * кого (в начале игры плашка не нужна).
 */
export function getRoomGoal(standings: readonly RoomStanding[], playerId: string): RoomGoal {
    const me = standings.find((row) => row.playerId === playerId);

    if (!me || standings.length < 2 || standings.every((row) => row.score === 0)) {
        return null;
    }

    const above = standings
        .filter((row) => row.score > me.score)
        .sort((left, right) => left.score - right.score)[0];

    if (!above) {
        const next = standings
            .filter((row) => row.playerId !== playerId)
            .sort((left, right) => right.score - left.score)[0];

        return next ? { kind: 'lead', ahead: me.score - next.score } : null;
    }

    return { kind: 'chase', targetRank: above.rank, behind: above.score - me.score };
}
