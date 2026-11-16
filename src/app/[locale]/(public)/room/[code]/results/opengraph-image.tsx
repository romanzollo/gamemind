/**
 * Превью ссылки на итоги комнаты (Open Graph): подиум топ-3 с очками и
 * призыв «Собрать свою комнату». Комнаты нет / не доиграна / база не
 * ответила — нейтральная карточка с кодом.
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

const STEP = {
    1: { height: 250, background: ROOM_OG_COLORS.gold, color: ROOM_OG_COLORS.goldFg },
    2: { height: 190, background: ROOM_OG_COLORS.silver, color: ROOM_OG_COLORS.silverFg },
    3: { height: 150, background: ROOM_OG_COLORS.bronze, color: ROOM_OG_COLORS.bronzeFg },
} as const;

export default async function RoomResultsOpenGraphImage({
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
    const finished = state?.status === 'finished' ? state : null;
    const byId = new Map((finished?.players ?? []).map((player) => [player.id, player]));

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '56px 80px',
                    background: ROOM_OG_COLORS.background,
                    color: ROOM_OG_COLORS.foreground,
                    fontFamily: 'Plex',
                }}
            >
                <RoomOgHeader tag={fillRoomText(text.resultsPublicTitle, { code })} />

                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 24 }}>
                    {finished
                        ? ([2, 1, 3] as const).map((place) => {
                              const row = finished.standings[place - 1];
                              const player = row ? byId.get(row.playerId) : undefined;

                              if (!row || !player) return <div key={place} style={{ display: 'flex', width: 260 }} />;

                              return (
                                  <div key={place} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 260 }}>
                                      <RoomOgAvatar name={player.nickname} pattern={player.avatarPattern} size={72} />
                                      <div
                                          style={{
                                              display: 'flex',
                                              flexDirection: 'column',
                                              alignItems: 'center',
                                              justifyContent: 'flex-start',
                                              width: 260,
                                              height: STEP[place].height,
                                              marginTop: 10,
                                              paddingTop: 14,
                                              borderRadius: '18px 18px 6px 6px',
                                              background: STEP[place].background,
                                              color: STEP[place].color,
                                          }}
                                      >
                                          <div style={{ fontFamily: 'Oswald', fontSize: 64, lineHeight: 1 }}>
                                              {/* Строкой: число как ребёнок <div> генератор превью считает «несколькими узлами» и падает. */}
                                              {String(row.rank)}
                                          </div>
                                          <div
                                              style={{
                                                  display: 'block',
                                                  fontSize: 30,
                                                  marginTop: 6,
                                                  maxWidth: 236,
                                                  overflow: 'hidden',
                                                  whiteSpace: 'nowrap',
                                                  textOverflow: 'ellipsis',
                                                  textAlign: 'center',
                                              }}
                                          >
                                              {player.nickname}
                                          </div>
                                          <div style={{ fontSize: 26, marginTop: 2 }}>{row.score.toLocaleString('ru-RU')}</div>
                                      </div>
                                  </div>
                              );
                          })
                        : (
                              <div style={{ fontFamily: 'Oswald', fontSize: 200, lineHeight: 1, letterSpacing: 24 }}>{code}</div>
                          )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div
                        style={{
                            background: ROOM_OG_COLORS.primary,
                            color: ROOM_OG_COLORS.primaryForeground,
                            fontSize: 34,
                            padding: '14px 28px',
                            borderRadius: 14,
                        }}
                    >
                        {text.resultsPublicCta}
                    </div>
                </div>
            </div>
        ),
        { ...size, fonts },
    );
}
