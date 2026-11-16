/**
 * Вид наград комнаты: значок (SVG в стиле токенов достижений, без эмодзи в
 * интерфейсе) и подписи «название · имя» + подсказка с числом. Общий для
 * итогов комнаты и раздела «Комнаты» в профиле. Эмодзи — только для текста,
 * который уходит в мессенджер (`ROOM_AWARD_EMOJI`).
 */

import type { RoomAward, RoomAwardKind } from '@/features/quiz-room/lib/room-awards';
import { fillRoomText } from '@/features/quiz-room/lib/room-labels';
import { formatPlural, type Dictionary, type Locale } from '@/shared/i18n';

const ICON_PATHS: Record<RoomAwardKind, string[]> = {
    fastest: ['M13 3L5 13h6l-1 8 8-10h-6l1-8Z'],
    sniper: ['M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M12 2v4M12 18v4M2 12h4M18 12h4'],
    streak: ['M12 21c4 0 6.5-2.6 6.5-6.2 0-3.2-2.2-5.4-3.6-7.3-.5 2-1.6 3-2.6 3.3C12.6 7.6 11 5 8.5 3 8.8 6.5 5.5 8.9 5.5 14.3 5.5 18.3 8.2 21 12 21Z'],
    solo: ['M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.8L12 16.5l-5.2 2.7 1-5.8-4.3-4.2 5.9-.9L12 3Z'],
    lightning: ['M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8'],
    clutch: ['M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9', 'M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5'],
    finisher: ['M5 21V4', 'M5 4h12l-2.5 4L17 12H5'],
    climb: ['M4 18l6-6 4 4 6-8', 'M15 8h5v5'],
    trigger: ['M9 11V5.5a1.5 1.5 0 0 1 3 0V11', 'M12 10.5V9a1.5 1.5 0 0 1 3 0v2', 'M15 10.5a1.5 1.5 0 0 1 3 0v3.5a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5.2-3l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L9 14'],
    brave: ['M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3Z'],
};

export const ROOM_AWARD_EMOJI: Record<RoomAwardKind, string> = {
    fastest: '⚡',
    sniper: '🎯',
    streak: '🔥',
    solo: '🎓',
    lightning: '✨',
    clutch: '🧊',
    finisher: '🏁',
    climb: '📈',
    trigger: '👆',
    brave: '🛡️',
};

export function RoomAwardIcon({ kind, muted = false }: { kind: RoomAwardKind; muted?: boolean }) {
    return (
        <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
                muted ? 'bg-surface-muted text-muted' : 'bg-primary/10 text-primary'
            }`}
        >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {ICON_PATHS[kind].map((d) => (
                    <path key={d} d={d} />
                ))}
            </svg>
        </span>
    );
}

function seconds(ms: number, locale: Locale): string {
    return (ms / 1000).toLocaleString(locale, { maximumFractionDigits: 1 });
}

/** «Самый быстрый · Аня» + «в среднем 2,1 с на верный ответ». */
export function roomAwardText(
    award: RoomAward,
    name: string,
    dictionary: Dictionary,
    locale: Locale,
    questionTotal: number,
): { title: string; hint: string } {
    const view = dictionary.room.awards[award.kind];
    const n = Math.round(award.value);
    const title = `${view.title} · ${name}`;

    switch (award.kind) {
        case 'fastest':
        case 'lightning':
            return { title, hint: fillRoomText(dictionary.room.awards[award.kind].hint, { seconds: seconds(award.value, locale) }) };
        case 'sniper':
            return { title, hint: fillRoomText(dictionary.room.awards.sniper.hint, { correct: n, total: questionTotal }) };
        case 'streak':
            return { title, hint: fillRoomText(dictionary.room.awards.streak.hint, { n }) };
        case 'solo':
        case 'clutch':
        case 'climb':
        case 'trigger':
            return { title, hint: formatPlural(locale, n, dictionary.room.awards[award.kind].hint) };
        case 'finisher':
        case 'brave':
            return { title, hint: dictionary.room.awards[award.kind].hint };
    }
}
