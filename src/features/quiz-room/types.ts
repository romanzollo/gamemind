/**
 * Что видит телефон игрока комнаты (ответ `GET /api/room/{code}`).
 *
 * Никаких userId и верных ответов до раскрытия: игрок — по публичному id
 * `RoomPlayer.id`, вопрос — только с момента показа, варианты — с момента
 * открытия, верный ключ — после закрытия приёма. Времена — мс серверных
 * часов; `serverNow` даёт клиенту поправку к своим часам.
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import type { RoomAward } from '@/features/quiz-room/lib/room-awards';
import type { RoomQuestionTimes } from '@/features/quiz-room/lib/room-schedule';
import type { RoomSettings } from '@/features/quiz-room/lib/room-rules';
import type { RoomStanding } from '@/features/quiz-room/lib/room-scoring';
import type { Difficulty, QuestionType } from '@/types';

export type RoomStatusDto = 'lobby' | 'starting' | 'playing' | 'finished' | 'closed';

export type RoomPlayerDto = {
    id: string;
    nickname: string;
    avatarUrl: string | null;
    /** Номер эмблемы-аватара (без userId наружу). */
    avatarPattern: number;
    isHost: boolean;
    isMe: boolean;
    /** Опрашивал состояние последние 12 с. */
    connected: boolean;
};

export type RoomOptionDto = { key: string; text: string };

export type RoomRevealDto = {
    correctKey: string;
    /** Сколько игроков выбрали каждый вариант. */
    counts: Record<string, number>;
    myKey: string | null;
    myPoints: number;
    /** Первый верный ответ на этот вопрос («быстрее всех»); null — верных нет. */
    fastestPlayerId: string | null;
};

export type RoomCurrentQuestionDto = {
    position: number;
    type: QuestionType;
    difficulty: Difficulty;
    imageUrl: string | null;
    text: string;
    /** null — ещё идёт показ вопроса (варианты не открыты). */
    options: RoomOptionDto[] | null;
    /** Кто уже ответил на этот вопрос (без того, что ответил). */
    answeredPlayerIds: string[];
    myAnswerKey: string | null;
    /** После закрытия приёма. */
    reveal: RoomRevealDto | null;
};

export type RoomMark = 'correct' | 'wrong' | 'missed';

export type RoomStateDto = {
    serverNow: number;
    code: string;
    status: RoomStatusDto;
    isHost: boolean;
    /** null — смотрит не участник (страница покажет вход). */
    me: { playerId: string; nickname: string } | null;
    settings: RoomSettings & {
        topicName: string | null;
    };
    players: RoomPlayerDto[];
    /** Расписание (пусто до старта). */
    schedule: RoomQuestionTimes[];
    current: RoomCurrentQuestionDto | null;
    /** Таблица по раскрытым вопросам. */
    standings: RoomStanding[];
    /** Мои отметки по раскрытым вопросам. */
    myMarks: RoomMark[];
    /** «Ещё раунд»: код новой комнаты ведущего. */
    nextRoomCode: string | null;
    /** Сколько игроков уже в новом раунде. */
    nextRoomPlayers: number | null;
    /** Награды раунда — только когда игра сыграна. */
    awards: RoomAward[];
};

/** Вопрос, где игрок ошибся или не успел (разбор в итогах). */
export type RoomReviewItemDto = {
    position: number;
    text: string;
    imageUrl: string | null;
    myAnswer: string | null;
    rightAnswer: string;
};

export type RoomErrorCode =
    | 'NOT_FOUND'
    | 'CLOSED'
    | 'STARTED'
    | 'FULL'
    | 'KICKED'
    | 'NOT_HOST'
    | 'NOT_MEMBER'
    | 'NOT_ENOUGH_PLAYERS'
    | 'NOT_ENOUGH_QUESTIONS'
    | 'INVALID'
    | 'GUEST_HOST'
    | 'RATE_LIMITED'
    | 'TIME_UP'
    | 'RETRY';

/** Состояние форм входа и создания (Server Actions). */
export type RoomFormState = {
    errorCode?: RoomErrorCode;
    /** Вход удался: клиент открывает комнату полной загрузкой страницы. */
    roomUrl?: string;
};
