/**
 * Сервис комнаты: правила поверх репозитория. Здесь решается, что видит
 * игрок (`readRoomState`), как принимается ответ, что может ведущий.
 * Только сервер: зовут Route Handlers `/api/room/*` и Server Actions.
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { randomBytes } from 'node:crypto';

import { loadSnapshotBundleByQuestionIdsWithPgClient } from '@/entities/question/question-quiz-pick.repository';
import {
    quizRoomRepository,
    type RoomAnswerRow,
    type RoomQuestionPayload,
    type RoomRow,
    type RoomSettingsWrite,
} from '@/entities/quiz-room/quiz-room.repository';
import { generateRoomCode } from '@/features/quiz-room/lib/room-code';
import {
    dedupeRoomNickname,
    normalizeRoomNickname,
} from '@/features/quiz-room/lib/room-nickname';
import { orderOptionsForPlayer } from '@/features/quiz-room/lib/room-option-order';
import { pickRoomQuestionIds } from '@/features/quiz-room/lib/room-pick';
import {
    DEFAULT_ROOM_SETTINGS,
    parseRoomSettings,
    ROOM_ANSWER_SECONDS,
    ROOM_MIN_PLAYERS_TO_START,
    ROOM_QUESTION_COUNTS,
    ROOM_TIMING,
    type RoomSettings,
} from '@/features/quiz-room/lib/room-rules';
import {
    buildRoomSchedule,
    countRevealedQuestions,
    isAnswerWindowOpen,
    type RoomQuestionTimes,
} from '@/features/quiz-room/lib/room-schedule';
import {
    computeRoomStandings,
    scoreRoomAnswer,
    type RoomScoredAnswer,
} from '@/features/quiz-room/lib/room-scoring';
import type {
    RoomCurrentQuestionDto,
    RoomErrorCode,
    RoomMark,
    RoomPlayerDto,
    RoomStateDto,
    RoomStatusDto,
} from '@/features/quiz-room/types';
import type { Locale } from '@/shared/i18n';
import { getAvatarPattern } from '@/shared/ui/avatar-pattern';
import { normalizeQuizImageUrl } from '@/shared/utils';

const CREATE_CODE_ATTEMPTS = 6;

export function toSettingsWrite(settings: RoomSettings): RoomSettingsWrite {
    const difficulty = settings.difficulty === 'MIXED' ? null : settings.difficulty;

    return {
        questionCount: settings.questionCount,
        difficulty,
        poolKind: difficulty ? 'SINGLE' : 'MIXED',
        topicTagId: settings.topicId,
        answerSeconds: settings.answerSeconds,
        speedScoring: settings.speedScoring,
    };
}

/** Строка → настройки; неизвестные значения (ручная правка БД) → по умолчанию. */
export function settingsFromRow(room: RoomRow): RoomSettings {
    const questionCount = (ROOM_QUESTION_COUNTS as readonly number[]).includes(room.questionCount)
        ? (room.questionCount as RoomSettings['questionCount'])
        : DEFAULT_ROOM_SETTINGS.questionCount;
    const answerSeconds = (ROOM_ANSWER_SECONDS as readonly number[]).includes(room.answerSeconds)
        ? (room.answerSeconds as RoomSettings['answerSeconds'])
        : DEFAULT_ROOM_SETTINGS.answerSeconds;

    return {
        questionCount,
        difficulty:
            room.poolKind === 'MIXED' || !room.difficulty ? 'MIXED' : room.difficulty,
        topicId: room.topicTagId,
        answerSeconds,
        speedScoring: room.speedScoring,
    };
}

function toStatusDto(room: RoomRow, now: number): RoomStatusDto {
    switch (room.status) {
        case 'LOBBY':
            return now - room.createdAt.getTime() > ROOM_TIMING.lobbyTtlMs ? 'closed' : 'lobby';
        case 'STARTING':
            return 'starting';
        case 'PLAYING':
            return 'playing';
        case 'FINISHED':
            return 'finished';
        case 'CLOSED':
            return 'closed';
    }
}

/** Новая комната ведущего; null — не нашлось свободного кода (почти невозможно). */
export async function createRoom(input: {
    hostUserId: string;
    nickname: string;
    settings?: RoomSettings;
}): Promise<string | null> {
    const settings = toSettingsWrite(input.settings ?? DEFAULT_ROOM_SETTINGS);

    for (let attempt = 0; attempt < CREATE_CODE_ATTEMPTS; attempt += 1) {
        const code = generateRoomCode();
        const created = await quizRoomRepository.createRoom({
            hostUserId: input.hostUserId,
            nickname: input.nickname,
            code,
            settings,
            now: new Date(),
        });

        if (created) {
            return code;
        }
    }

    return null;
}

export type JoinRoomResult =
    | { ok: true }
    | { ok: false; errorCode: RoomErrorCode };

/** Вход в лобби по коду с именем (уже проверенным) — свободное имя подберём. */
export async function joinRoom(input: {
    code: string;
    userId: string;
    nickname: string;
}): Promise<JoinRoomResult> {
    const outcome = await quizRoomRepository.joinByCode({
        code: input.code,
        userId: input.userId,
        now: new Date(),
        pickNickname: (taken) => dedupeRoomNickname(input.nickname, taken),
    });

    switch (outcome.kind) {
        case 'joined':
        case 'member':
            return { ok: true };
        case 'not_found':
            return { ok: false, errorCode: 'NOT_FOUND' };
        case 'closed':
            return { ok: false, errorCode: 'CLOSED' };
        case 'started':
            return { ok: false, errorCode: 'STARTED' };
        case 'full':
            return { ok: false, errorCode: 'FULL' };
        case 'kicked':
            return { ok: false, errorCode: 'KICKED' };
    }
}

function scoredAnswers(
    answers: readonly RoomAnswerRow[],
    schedule: readonly RoomQuestionTimes[],
): RoomScoredAnswer[] {
    const openAt = new Map(schedule.map((times) => [times.position, times.openAt]));

    return answers.map((answer) => ({
        playerId: answer.playerId,
        position: answer.position,
        isCorrect: answer.isCorrect,
        points: answer.points,
        elapsedMs: answer.answeredAt.getTime() - (openAt.get(answer.position) ?? 0),
    }));
}

/**
 * Состояние комнаты глазами игрока. Отсекает всё, что ещё рано знать:
 * вопрос до показа, варианты до открытия, верный ответ и чужие очки до
 * закрытия приёма.
 */
export async function readRoomState(input: {
    code: string;
    userId: string | null;
    locale: Locale;
}): Promise<RoomStateDto | null> {
    const nowDate = new Date();
    const now = nowDate.getTime();
    const snapshot = await quizRoomRepository.readSnapshot({
        code: input.code,
        userId: input.userId,
        now: nowDate,
    });

    if (!snapshot) {
        return null;
    }

    const { room } = snapshot;
    const active = snapshot.players.filter((player) => player.status === 'ACTIVE');
    const meRow = input.userId
        ? active.find((player) => player.userId === input.userId) ?? null
        : null;
    const hostPlayer = active.find((player) => player.userId === room.hostUserId);
    const schedule: RoomQuestionTimes[] = snapshot.questions.map((question) => ({
        position: question.position,
        introAt: question.introAt.getTime(),
        openAt: question.openAt.getTime(),
        closeAt: question.closeAt.getTime(),
    }));
    const revealedCount = countRevealedQuestions(schedule, now);
    const answers = scoredAnswers(snapshot.answers, schedule);
    const players: RoomPlayerDto[] = active.map((player) => ({
        id: player.id,
        nickname: player.nickname,
        avatarUrl: player.image,
        avatarPattern: getAvatarPattern(player.userId),
        isHost: player.id === hostPlayer?.id,
        isMe: player.id === meRow?.id,
        connected: now - player.lastSeenAt.getTime() <= ROOM_TIMING.presenceMs,
    }));
    const settings = settingsFromRow(room);
    const topicName =
        input.locale === 'en' ? room.topicNameEn : room.topicNameRu;

    let current: RoomCurrentQuestionDto | null = null;

    // Вопросы видит только участник: по коду чужой не подсмотрит игру.
    if (meRow && snapshot.current) {
        const { position, payload } = snapshot.current;
        const times = schedule[position];
        const correctKey = snapshot.questions[position]?.correctKey ?? null;

        if (times) {
            const ownAnswers = snapshot.answers.filter(
                (answer) => answer.position === position,
            );
            const myAnswer = ownAnswers.find((answer) => answer.playerId === meRow.id);
            const isOpen = now >= times.openAt;
            const counts: Record<string, number> = {};

            for (const answer of ownAnswers) {
                counts[answer.optionKey] = (counts[answer.optionKey] ?? 0) + 1;
            }

            current = {
                position,
                type: payload.type,
                difficulty: payload.difficulty,
                imageUrl: normalizeQuizImageUrl(payload.imageUrl),
                text: payload.text[input.locale] || payload.text.ru,
                options: isOpen
                    ? orderOptionsForPlayer(payload.options, room.id, meRow.id, position).map(
                          (option) => ({
                              key: option.key,
                              text: option.text[input.locale] || option.text.ru,
                          }),
                      )
                    : null,
                answeredPlayerIds: ownAnswers.map((answer) => answer.playerId),
                myAnswerKey: myAnswer?.optionKey ?? null,
                reveal:
                    correctKey && now >= times.closeAt
                        ? {
                              correctKey,
                              counts,
                              myKey: myAnswer?.optionKey ?? null,
                              myPoints: myAnswer?.points ?? 0,
                          }
                        : null,
            };
        }
    }

    const myMarks: RoomMark[] = [];

    if (meRow) {
        for (let position = 0; position < revealedCount; position += 1) {
            const answer = snapshot.answers.find(
                (row) => row.playerId === meRow.id && row.position === position,
            );
            myMarks.push(answer ? (answer.isCorrect ? 'correct' : 'wrong') : 'missed');
        }
    }

    return {
        serverNow: Date.now(),
        code: input.code,
        status: toStatusDto(room, now),
        isHost: Boolean(input.userId && room.hostUserId === input.userId),
        me: meRow ? { playerId: meRow.id, nickname: meRow.nickname } : null,
        settings: { ...settings, topicName: settings.topicId ? topicName : null },
        players,
        schedule,
        current,
        standings: computeRoomStandings(
            players.map((player) => player.id),
            answers,
            revealedCount,
        ),
        myMarks,
        nextRoomCode: room.nextRoomCode,
    };
}

export type SubmitRoomAnswerResult =
    | { status: 'accepted' }
    | { status: 'replay' }
    | { status: 'error'; errorCode: RoomErrorCode };

/** Ответ на вопрос: время — момент прихода запроса (до auth и hop-ов). */
export async function submitRoomAnswer(input: {
    code: string;
    userId: string;
    position: number;
    optionKey: string;
    receivedAt: Date;
}): Promise<SubmitRoomAnswerResult> {
    const received = input.receivedAt.getTime();
    let rejection: RoomErrorCode = 'TIME_UP';

    const outcome = await quizRoomRepository.submitAnswer(input, (context) => {
        const openAt = new Date(context.openAt).getTime();
        const closeAt = new Date(context.closeAt).getTime();

        if (context.playerStatus !== 'ACTIVE') {
            rejection = 'NOT_MEMBER';
            return { kind: 'reject' };
        }

        if (!context.optionKeys.includes(input.optionKey)) {
            rejection = 'INVALID';
            return { kind: 'reject' };
        }

        if (context.status !== 'PLAYING' || !isAnswerWindowOpen({ openAt, closeAt }, received)) {
            rejection = 'TIME_UP';
            return { kind: 'reject' };
        }

        const isCorrect = input.optionKey === context.correctKey;

        return {
            kind: 'insert',
            optionKey: input.optionKey,
            isCorrect,
            points: scoreRoomAnswer({
                isCorrect,
                elapsedMs: received - openAt,
                answerMs: context.answerSeconds * 1000,
                speedScoring: context.speedScoring,
            }),
            answeredAt: input.receivedAt,
        };
    });

    switch (outcome.kind) {
        case 'not_found':
            return { status: 'error', errorCode: 'NOT_FOUND' };
        case 'inserted':
            return { status: 'accepted' };
        case 'replay':
            return { status: 'replay' };
        case 'rejected':
            // Повтор после обрыва сети, когда окно уже закрылось, — не ошибка.
            return outcome.ownAnswer && rejection === 'TIME_UP'
                ? { status: 'replay' }
                : { status: 'error', errorCode: rejection };
    }
}

/** Случайные ключи вариантов: id из БД наружу не уходят (-opt-0 = верный). */
function newOptionKeys(count: number): string[] {
    const keys = new Set<string>();

    while (keys.size < count) {
        keys.add(randomBytes(4).toString('base64url'));
    }

    return [...keys];
}

export type HostActionResult =
    | { ok: true; nextRoomCode?: string }
    | { ok: false; errorCode: RoomErrorCode };

async function findHostRoom(
    code: string,
    userId: string,
): Promise<{ room: RoomRow } | { error: RoomErrorCode }> {
    const room = await quizRoomRepository.findRoomByCode(code);

    if (!room) return { error: 'NOT_FOUND' };
    if (room.hostUserId !== userId) return { error: 'NOT_HOST' };

    return { room };
}

export async function updateRoomSettings(input: {
    code: string;
    userId: string;
    settings: unknown;
}): Promise<HostActionResult> {
    const settings = parseRoomSettings(input.settings);

    if (!settings) return { ok: false, errorCode: 'INVALID' };

    const found = await findHostRoom(input.code, input.userId);

    if ('error' in found) return { ok: false, errorCode: found.error };

    if (settings.topicId && !(await quizRoomRepository.isPlayTopic(settings.topicId))) {
        return { ok: false, errorCode: 'INVALID' };
    }

    const updated = await quizRoomRepository.updateSettings(
        found.room.id,
        input.userId,
        toSettingsWrite(settings),
    );

    return updated ? { ok: true } : { ok: false, errorCode: 'STARTED' };
}

export async function kickRoomPlayer(input: {
    code: string;
    userId: string;
    playerId: string;
}): Promise<HostActionResult> {
    const found = await findHostRoom(input.code, input.userId);

    if ('error' in found) return { ok: false, errorCode: found.error };

    const kicked = await quizRoomRepository.kickPlayer(
        found.room.id,
        input.userId,
        input.playerId,
    );

    return kicked ? { ok: true } : { ok: false, errorCode: 'INVALID' };
}

/**
 * Старт: LOBBY → STARTING (игроков хватает) → выбор и разворот вопросов на
 * одном pooled-клиенте → расписание от момента после сборки → PLAYING.
 * Мало вопросов под настройки — комната остаётся в лобби.
 */
export async function startRoom(input: {
    code: string;
    userId: string;
}): Promise<HostActionResult> {
    const found = await findHostRoom(input.code, input.userId);

    if ('error' in found) return { ok: false, errorCode: found.error };

    const claimed = await quizRoomRepository.claimStart(
        found.room.id,
        input.userId,
        ROOM_MIN_PLAYERS_TO_START,
        new Date(),
    );

    if (!claimed) {
        return {
            ok: false,
            errorCode: found.room.status === 'LOBBY' ? 'NOT_ENOUGH_PLAYERS' : 'STARTED',
        };
    }

    const settings = settingsFromRow(claimed);
    const outcome = await quizRoomRepository.finishStart(claimed.id, async (client) => {
        const pool = await quizRoomRepository.loadQuestionPool(
            client,
            settings.difficulty === 'MIXED' ? null : settings.difficulty,
            settings.topicId,
        );
        const ids = pickRoomQuestionIds(pool, settings);

        if (!ids) {
            return null;
        }

        const bundle = await loadSnapshotBundleByQuestionIdsWithPgClient(client, ids, 'ru');

        if (bundle.length !== ids.length) {
            return null;
        }

        // Часы — JS Date после сборки: отсчёт начинается, когда вопросы готовы.
        const startedAt = new Date();
        const schedule = buildRoomSchedule(
            startedAt.getTime(),
            bundle.map((question) =>
                Math.max(question.displayTexts.ru.length, question.displayTexts.en.length),
            ),
            settings.answerSeconds,
        );

        const rows = bundle.map((question, position) => {
            const keys = newOptionKeys(question.options.length);
            const options = question.options.map((option, index) => ({
                key: keys[index]!,
                text: { ru: option.displayTexts.ru, en: option.displayTexts.en },
            }));
            const correctIndex = question.options.findIndex((option) => option.isCorrect);
            const times = schedule[position]!;
            const payload: RoomQuestionPayload = {
                v: 1,
                type: question.type,
                difficulty: question.difficulty,
                imageUrl: question.displayImageUrl,
                text: { ru: question.displayTexts.ru, en: question.displayTexts.en },
                options,
            };

            if (correctIndex < 0) {
                throw new Error(`Room question ${question.id} has no correct option`);
            }

            return {
                position,
                questionId: question.id,
                payload,
                correctKey: keys[correctIndex]!,
                introAt: new Date(times.introAt),
                openAt: new Date(times.openAt),
                closeAt: new Date(times.closeAt),
            };
        });

        return { startedAt, rows };
    });

    return outcome === 'started'
        ? { ok: true }
        : { ok: false, errorCode: 'NOT_ENOUGH_QUESTIONS' };
}

/**
 * «Ещё раунд»: новая комната с теми же настройками, финальная ссылается на
 * неё. Повторное нажатие отдаёт ту же новую комнату.
 */
export async function rematchRoom(input: {
    code: string;
    userId: string;
}): Promise<HostActionResult> {
    const found = await findHostRoom(input.code, input.userId);

    if ('error' in found) return { ok: false, errorCode: found.error };

    const { room } = found;

    if (room.status !== 'FINISHED') return { ok: false, errorCode: 'STARTED' };
    if (room.nextRoomCode) return { ok: true, nextRoomCode: room.nextRoomCode };

    const players = await quizRoomRepository.findPlayers(room.id);
    const host = players.find((player) => player.userId === input.userId);
    const nextRoomCode = await createRoom({
        hostUserId: input.userId,
        nickname: host?.nickname ?? 'Host',
        settings: settingsFromRow(room),
    });

    if (!nextRoomCode) return { ok: false, errorCode: 'RETRY' };

    await quizRoomRepository.linkNextRoom(room.id, input.userId, nextRoomCode);

    return { ok: true, nextRoomCode };
}

export async function renameRoomPlayer(input: {
    code: string;
    userId: string;
    nickname: unknown;
}): Promise<HostActionResult> {
    const nickname = normalizeRoomNickname(input.nickname);

    if (!nickname) return { ok: false, errorCode: 'INVALID' };

    const room = await quizRoomRepository.findRoomByCode(input.code);

    if (!room) return { ok: false, errorCode: 'NOT_FOUND' };

    const players = await quizRoomRepository.findPlayers(room.id);
    const taken = players
        .filter((player) => player.status === 'ACTIVE' && player.userId !== input.userId)
        .map((player) => player.nickname);
    const renamed = await quizRoomRepository.setNickname(
        room.id,
        input.userId,
        dedupeRoomNickname(nickname, taken),
    );

    return renamed ? { ok: true } : { ok: false, errorCode: 'STARTED' };
}

export async function leaveRoom(input: { code: string; userId: string }): Promise<HostActionResult> {
    const room = await quizRoomRepository.findRoomByCode(input.code);

    if (!room) return { ok: false, errorCode: 'NOT_FOUND' };

    await quizRoomRepository.leaveLobby(room.id, input.userId);

    return { ok: true };
}
