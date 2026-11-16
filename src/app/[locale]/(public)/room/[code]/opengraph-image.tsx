/**
 * Превью ссылки-приглашения в комнату (Open Graph): огромный код, кто
 * зовёт, кто уже внутри (+ место для тебя) и призыв «Войти по коду».
 * Рендерится на запрос (одно чтение состояния комнаты). Комнаты нет или
 * база не ответила — нейтральная карточка с кодом.
 * Canon: docs/DECISIONS.md → Quiz room (v3).
 */

import { ImageResponse } from 'next/og';

import { normalizeRoomCode } from '@/features/quiz-room/lib/room-code';
import { fillRoomText } from '@/features/quiz-room/lib/room-labels';
import {
    loadRoomOgFonts,
    ROOM_OG_COLORS,
    ROOM_OG_SIZE,
    RoomOgAvatar,
    RoomOgHeader,
} from '@/features/quiz-room/server/room-og';
import { readRoomState } from '@/features/quiz-room/server/room-service';
import { getDictionary, isLocale } from '@/shared/i18n';

export const alt = 'GameMind';
export const size = ROOM_OG_SIZE;
export const contentType = 'image/png';

const SHOWN_AVATARS = 6;

export default async function RoomInviteOpenGraphImage({
    params,
}: {
    params: Promise<{ locale: string; code: string }>;
}) {
    const { locale: rawLocale, code: rawCode } = await params;
    const locale = isLocale(rawLocale) ? rawLocale : 'ru';
    const text = getDictionary(locale).room;
    const code = normalizeRoomCode(rawCode) ?? '';
    const [state, fonts] = await Promise.all([
        code ? readRoomState({ code, userId: null, locale }).catch(() => null) : Promise.resolve(null),
        loadRoomOgFonts(),
    ]);
    const host = state?.players.find((player) => player.isHost);
    const players = state?.players ?? [];

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '60px 80px',
                    background: ROOM_OG_COLORS.background,
                    color: ROOM_OG_COLORS.foreground,
                    fontFamily: 'Plex',
                }}
            >
                <RoomOgHeader tag={text.ogInviteTag} />

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontFamily: 'Oswald', fontSize: 210, lineHeight: 1, letterSpacing: 24 }}>
                        {code}
                    </div>
                    {host ? (
                        <div style={{ fontSize: 44, marginTop: 10 }}>
                            {fillRoomText(text.invite, { name: host.nickname })}
                        </div>
                    ) : null}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        {players.slice(0, SHOWN_AVATARS).map((player, index) => (
                            <div key={player.id} style={{ display: 'flex', marginLeft: index === 0 ? 0 : -14 }}>
                                <RoomOgAvatar name={player.nickname} pattern={player.avatarPattern} />
                            </div>
                        ))}
                        <div style={{ fontSize: 30, color: ROOM_OG_COLORS.muted, marginLeft: 20 }}>
                            {text.ogInviteSeat}
                        </div>
                    </div>
                    <div
                        style={{
                            background: ROOM_OG_COLORS.primary,
                            color: ROOM_OG_COLORS.primaryForeground,
                            fontSize: 34,
                            padding: '14px 28px',
                            borderRadius: 14,
                        }}
                    >
                        {text.ogInviteCta}
                    </div>
                </div>
            </div>
        ),
        { ...size, fonts },
    );
}
