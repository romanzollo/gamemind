/**
 * Тексты «Позвать» и «Поделиться итогом» комнаты для мессенджеров (pure).
 *
 * Короткие строки вместо абзаца: в Telegram сообщение читается сверху вниз,
 * первая строка — крючок (код комнаты / место), потом подробности и призыв.
 * Жирным мессенджер показывает только `og:title` превью — поэтому у
 * приглашения и итогов свои карточки (`/room/{code}`, `/room/{code}/results`).
 * Эмодзи — только в тексте, который уходит в мессенджер (docs/DESIGN.md).
 * Ссылки Telegram / VK / MAX — как у «Поделиться результатом».
 *
 * Canon: docs/DECISIONS.md → Quiz room (v3); Share result.
 */

import { SQUARE_EMOJI, type ShareTargets } from '@/features/quiz/lib/build-result-share';
import { fillRoomText } from '@/features/quiz-room/lib/room-labels';
import type { RoomMark } from '@/features/quiz-room/types';

export type RoomShare = {
    /** Полный текст со ссылкой — для системного меню и буфера. */
    text: string;
    targets: ShareTargets;
};

function targetsFor(url: string, textWithoutUrl: string, title: string): ShareTargets {
    const encodedUrl = encodeURIComponent(url);

    return {
        telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(textWithoutUrl)}`,
        vk: `https://vk.com/share.php?url=${encodedUrl}&title=${encodeURIComponent(title)}`,
        max: `https://max.ru/:share?text=${encodeURIComponent(`${textWithoutUrl}\n${url}`)}`,
    };
}

export function buildRoomInviteShare(
    input: { code: string; hostName: string; settings: string; players: string; url: string },
    labels: { header: string; host: string; players: string },
): RoomShare {
    const lines = [
        fillRoomText(labels.header, { code: input.code }),
        fillRoomText(labels.host, { name: input.hostName, settings: input.settings }),
        fillRoomText(labels.players, { players: input.players }),
    ];
    const textWithoutUrl = lines.join('\n');

    return {
        text: `${textWithoutUrl}\n${input.url}`,
        targets: targetsFor(input.url, textWithoutUrl, lines[0]!),
    };
}

export type RoomResultShareLabels = {
    win: string;
    silver: string;
    bronze: string;
    place: string;
    score: string;
    lead: string;
    gap: string;
    cta: string;
};

export function buildRoomResultShare(
    input: {
        code: string;
        place: number;
        total: number;
        marks: readonly RoomMark[];
        /** «3 748 очков» — уже со склонением. */
        score: string;
        /** Своя награда: «⚡ Самый быстрый». */
        award: string | null;
        /** Победителю: кого обошёл и на сколько; остальным — сколько не хватило. */
        lead: { name: string; points: string } | null;
        gap: string | null;
        url: string;
    },
    labels: RoomResultShareLabels,
): RoomShare {
    const header =
        input.place === 1
            ? labels.win
            : input.place === 2
              ? labels.silver
              : input.place === 3
                ? labels.bronze
                : labels.place;
    const squares = input.marks
        .map((mark) => SQUARE_EMOJI[mark === 'correct' ? 'correct' : mark === 'wrong' ? 'wrong' : 'none'])
        .join('');
    const context = input.lead
        ? fillRoomText(labels.lead, { name: input.lead.name, points: input.lead.points })
        : input.gap
          ? fillRoomText(labels.gap, { points: input.gap })
          : null;
    const lines = [
        fillRoomText(header, { code: input.code, place: input.place, total: input.total }),
        fillRoomText(labels.score, { squares, score: input.score }).trim(),
        [input.award, context].filter(Boolean).join(' · ') || null,
        labels.cta,
    ].filter((line): line is string => Boolean(line));
    const textWithoutUrl = lines.join('\n');

    return {
        text: `${textWithoutUrl}\n${input.url}`,
        targets: targetsFor(input.url, textWithoutUrl, lines[0]!),
    };
}
