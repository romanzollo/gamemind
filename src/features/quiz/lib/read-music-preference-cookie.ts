/**
 * «Музыкальные вопросы» этого устройства — для Server Actions старта.
 *
 * Один источник для всех входов в игру (шторки, «Продолжить», реванш,
 * следующая волна Выживания): поле формы забыть нельзя, cookie приходит
 * с каждым запросом. Без Neon — только заголовок запроса.
 * Только сервер (next/headers). См. music-preference.ts.
 */

import { cookies } from 'next/headers';

import { readMusicPreference } from '@/features/quiz/lib/music-preference';

export async function readMusicPreferenceCookie(): Promise<boolean> {
    const cookieStore = await cookies();

    return readMusicPreference((name) => cookieStore.get(name)?.value);
}
