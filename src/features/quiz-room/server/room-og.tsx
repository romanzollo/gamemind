/**
 * Общее для карточек превью комнаты (Open Graph, Telegram / VK / MAX):
 * шрифты с диска (как у превью сайта и «Вызова другу»; пути — в
 * outputFileTracingIncludes next.config), цвета тёмной темы строками
 * (генератор не знает CSS-переменных — исключение из DESIGN.md, правило 1),
 * шапка с меткой и знаком GameMind, кружок-аватар с первой буквой.
 * Canon: docs/DECISIONS.md → Quiz room (v3); Friend challenge.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { OgAnswerGridMark } from '@/shared/ui/og-answer-grid-mark';

export const ROOM_OG_SIZE = { width: 1200, height: 630 };

export const ROOM_OG_COLORS = {
    background: '#16191f',
    surface: '#20242c',
    foreground: '#e8ecf1',
    muted: '#a3acb8',
    primary: '#3ecf8e',
    primaryForeground: '#06140d',
    gold: '#4a3f1a',
    goldFg: '#f0d56a',
    silver: '#383f4a',
    silverFg: '#d3dae3',
    bronze: '#4a3423',
    bronzeFg: '#e8b98a',
};

/** Тона эмблем-аватаров тёмной темы (avatar-1…6). */
const AVATAR_TONES = ['#1c5442', '#1f4560', '#5c4614', '#5a3a22', '#343c49', '#444f22'];

export async function loadRoomOgFonts() {
    const base = join(process.cwd(), 'node_modules/@fontsource');
    const [oswald, plexLatin, plexCyrillic] = await Promise.all([
        readFile(join(base, 'oswald/files/oswald-latin-600-normal.woff')),
        readFile(join(base, 'ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff')),
        readFile(join(base, 'ibm-plex-sans/files/ibm-plex-sans-cyrillic-500-normal.woff')),
    ]);

    return [
        { name: 'Oswald', data: oswald, weight: 600 as const, style: 'normal' as const },
        { name: 'Plex', data: plexLatin, weight: 500 as const, style: 'normal' as const },
        { name: 'Plex', data: plexCyrillic, weight: 500 as const, style: 'normal' as const },
    ];
}

export function RoomOgHeader({ tag }: { tag: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 28, letterSpacing: 6, color: ROOM_OG_COLORS.primary }}>
                {tag.toUpperCase()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <OgAnswerGridMark size={40} />
                <div style={{ fontFamily: 'Oswald', fontSize: 40 }}>GameMind</div>
            </div>
        </div>
    );
}

export function RoomOgAvatar({ name, pattern, size = 64 }: { name: string; pattern: number; size?: number }) {
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: size,
                background: AVATAR_TONES[pattern % AVATAR_TONES.length],
                border: `3px solid ${ROOM_OG_COLORS.background}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: size * 0.45,
                color: '#dfe7e4',
            }}
        >
            {[...name.trim()][0]?.toUpperCase() ?? '?'}
        </div>
    );
}
