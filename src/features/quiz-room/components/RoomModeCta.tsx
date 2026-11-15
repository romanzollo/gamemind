/**
 * Карточка «Комната» на главной (четвёртый режим): шторка с описанием,
 * «Создать комнату» и вводом кода. Создавать может аккаунт; гостю и
 * посетителю — вход в аккаунт и ввод кода (войти в чужую комнату может
 * каждый). Presentation only: проверки — в действиях и API комнаты.
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { ModeSheetCard } from '@/features/quiz/components/ModeSheetCard';
import { RoomEntry } from '@/features/quiz-room/components/RoomEntry';
import type { Dictionary, Locale } from '@/shared/i18n';

type RoomModeCtaProps = {
    locale: Locale;
    dictionary: Dictionary;
    /** Вошёл аккаунтом (не гость). JWT-флаг; действие перепроверит по БД. */
    canCreate: boolean;
};

export function RoomModeCta({ locale, dictionary, canCreate }: RoomModeCtaProps) {
    const text = dictionary.room;

    return (
        <ModeSheetCard
            title={text.title}
            glyph="room"
            summary={text.summary}
            description={text.description}
            hint={text.notRanked}
            closeLabel={dictionary.common.close}
            testId="mode-room"
        >
            <RoomEntry locale={locale} canCreate={canCreate} />
        </ModeSheetCard>
    );
}
